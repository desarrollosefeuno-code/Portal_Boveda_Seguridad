import { Router, type Request } from 'express';
import type { z } from 'zod';
import { query, transaction, type Queryable } from '../db/connection.js';
import { aad, decryptValue, encryptValue, randomId } from '../services/cryptoService.js';
import { auditStrict } from '../services/auditService.js';
import { requireAdmin, requireAuth, type AuthenticatedUser } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';
import { rateLimit } from '../middleware/security.js';
import {
  handler,
  HttpError,
  idParam,
  keyCreateSchema,
  keyUpdateSchema,
  parse,
  passwordCreateSchema,
  passwordUpdateSchema,
  revealQuery,
  versionParam,
} from '../validation.js';

/**
 * Rutas comunes de contraseñas de portales y de llaves técnicas (antes duplicadas).
 *
 * - El listado entrega solo metadatos: ningún secreto sale en bloque (A-04).
 * - El secreto se pide registro a registro en /:id/reveal y el servidor lo registra antes de entregarlo (falla cerrada).
 * - Las llaves se filtran por los entornos que el admin habilitó a cada usuario.
 * - Eliminar envía a la papelera; restaurar y purgar son acciones de admin (M-05).
 * - Al cambiar un secreto, el valor anterior queda en el historial (últimas 10 versiones).
 * - Editar exige la versión leída: si otro usuario guardó antes, se responde 409 (concurrencia).
 */

type ItemType = 'PASSWORD' | 'KEY';

interface PlainColumn {
  db: string;
  api: string;
}

interface ItemKind<C extends z.ZodType, U extends z.ZodType> {
  type: ItemType;
  table: 'vault_passwords' | 'vault_keys';
  secretColumn: string;
  extraColumn: string;
  secretField: 'password' | 'secret';
  extraField: 'additionalFields' | 'additionalData';
  plain: PlainColumn[];
  createSchema: C;
  updateSchema: U;
  filterByEnvironment: boolean;
  singular: string;
}

const MAX_VERSIONS = 10;

const PASSWORD_KIND: ItemKind<typeof passwordCreateSchema, typeof passwordUpdateSchema> = {
  type: 'PASSWORD',
  table: 'vault_passwords',
  secretColumn: 'encrypted_password',
  extraColumn: 'encrypted_additional_fields',
  secretField: 'password',
  extraField: 'additionalFields',
  plain: [
    { db: 'title', api: 'title' },
    { db: 'category', api: 'category' },
    { db: 'url', api: 'url' },
    { db: 'username', api: 'username' },
  ],
  createSchema: passwordCreateSchema,
  updateSchema: passwordUpdateSchema,
  filterByEnvironment: false,
  singular: 'Credencial',
};

const KEY_KIND: ItemKind<typeof keyCreateSchema, typeof keyUpdateSchema> = {
  type: 'KEY',
  table: 'vault_keys',
  secretColumn: 'encrypted_secret',
  extraColumn: 'encrypted_additional_data',
  secretField: 'secret',
  extraField: 'additionalData',
  plain: [
    { db: 'title', api: 'title' },
    { db: 'key_type', api: 'keyType' },
    { db: 'environment', api: 'environment' },
    { db: 'category', api: 'category' },
    { db: 'identifier', api: 'identifier' },
    { db: 'public_key', api: 'publicKey' },
    { db: 'expires_at', api: 'expiresAt' },
  ],
  createSchema: keyCreateSchema,
  updateSchema: keyUpdateSchema,
  filterByEnvironment: true,
  singular: 'Llave',
};

const revealLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 120,
  key: (req) => `reveal:${req.user?.id}`,
  message: 'Demasiadas revelaciones de secretos en poco tiempo. Espera unos minutos.',
});

/** Columnas de texto opcional que el cliente espera como cadena vacía en vez de null. */
const EMPTY_AS_TEXT = new Set(['url', 'username', 'identifier', 'public_key']);

function createItemRouter<C extends z.ZodType, U extends z.ZodType>(kind: ItemKind<C, U>): Router {
  const router = Router();
  router.use(requireAuth, requireVaultUnlocked);

  const plainSelect = kind.plain.map((c) => (c.db === 'expires_at' ? 'expires_at::text AS expires_at' : c.db)).join(', ');
  const ctx = (id: string, column: string) => aad(kind.table, id, column);

  /** Filtro de acceso: entornos permitidos (solo llaves; el admin ve todo). */
  const access = (user: AuthenticatedUser, startIndex: number): { sql: string; params: unknown[] } =>
    kind.filterByEnvironment && user.role !== 'admin'
      ? { sql: ` AND environment = ANY($${startIndex}::text[])`, params: [user.keyEnvironments] }
      : { sql: '', params: [] };

  const assertEnvironment = (user: AuthenticatedUser, environment: unknown) => {
    if (kind.filterByEnvironment && user.role !== 'admin' && !user.keyEnvironments.includes(environment as never)) {
      throw new HttpError(403, 'ENVIRONMENT_FORBIDDEN', 'No tienes acceso a llaves de ese entorno.');
    }
  };

  const toMeta = (row: Record<string, any>) => {
    const item: Record<string, unknown> = { id: row.id };
    for (const c of kind.plain) item[c.api] = row[c.db] ?? (EMPTY_AS_TEXT.has(c.db) ? '' : null);
    return {
      ...item,
      isFavorite: Boolean(row.is_favorite),
      tags: Array.isArray(row.tags) ? row.tags : [],
      hasExtra: Boolean(row[kind.extraColumn]),
      hasNotes: Boolean(row.encrypted_notes),
      version: row.version,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
      deletedBy: row.deleted_by ?? null,
    };
  };

  const baseSelect = `SELECT id, ${plainSelect}, is_favorite, tags, version, created_by, updated_by, created_at, updated_at,
      deleted_at, deleted_by, (${kind.extraColumn} IS NOT NULL) AS ${kind.extraColumn}, (encrypted_notes IS NOT NULL) AS encrypted_notes
    FROM ${kind.table}`;

  async function findActive(tx: Queryable, user: AuthenticatedUser, id: string, lock = false) {
    const filter = access(user, 2);
    const rows = await tx.query<Record<string, any>>(
      `SELECT * FROM ${kind.table} WHERE id = $1 AND deleted_at IS NULL${filter.sql}${lock ? ' FOR UPDATE' : ''}`,
      [id, ...filter.params]
    );
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', `${kind.singular} no encontrada.`);
    return rows[0];
  }

  const audit = (req: Request, eventType: string, id: string, title: string, details?: Record<string, unknown>, tx?: Queryable) =>
    auditStrict({ eventType, targetType: kind.type, targetId: id, targetTitle: title, userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name, req, details }, tx);

  /** Cifra los campos sensibles de una entrada, atados al id del registro. */
  function encryptFields(id: string, data: Record<string, any>) {
    const extra = data[kind.extraField];
    const hasExtra = Array.isArray(extra) ? extra.length > 0 : extra && Object.keys(extra).length > 0;
    return {
      extra: extra === undefined ? undefined : hasExtra ? encryptValue(JSON.stringify(extra), ctx(id, kind.extraColumn)) : null,
      notes: data.notes === undefined ? undefined : data.notes?.trim() ? encryptValue(data.notes.trim(), ctx(id, 'encrypted_notes')) : null,
    };
  }

  const plainValues = (data: Record<string, any>) => kind.plain.map((c) => data[c.api] ?? null);

  // GET / — listado sin secretos
  router.get(
    '/',
    handler(async (req, res) => {
      const filter = access(req.user!, 1);
      const rows = await query(`${baseSelect} WHERE deleted_at IS NULL${filter.sql} ORDER BY is_favorite DESC, updated_at DESC`, filter.params);
      res.json({ items: rows.map(toMeta) });
    })
  );

  // GET /trash — papelera (admin)
  router.get(
    '/trash',
    requireAdmin,
    handler(async (_req, res) => {
      const rows = await query(`${baseSelect} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 500`);
      res.json({ items: rows.map(toMeta) });
    })
  );

  // POST / — crear
  router.post(
    '/',
    handler(async (req, res) => {
      const data = parse(kind.createSchema, req.body) as Record<string, any>;
      const user = req.user!;
      assertEnvironment(user, data.environment);
      const id = randomId();
      const enc = encryptFields(id, data);
      const columns = [...kind.plain.map((c) => c.db), kind.secretColumn, kind.extraColumn, 'encrypted_notes', 'is_favorite', 'tags', 'created_by', 'updated_by', 'created_by_id', 'updated_by_id'];
      const values = [...plainValues(data), encryptValue(data[kind.secretField], ctx(id, kind.secretColumn)), enc.extra ?? null, enc.notes ?? null, data.isFavorite, data.tags, user.email, user.email, user.id, user.id];

      await transaction(async (tx) => {
        await tx.query(
          `INSERT INTO ${kind.table} (id, ${columns.join(', ')}) VALUES ($1, ${columns.map((_, i) => `$${i + 2}`).join(', ')})`,
          [id, ...values]
        );
        await audit(req, `CREATE_${kind.type}`, id, data.title, kind.filterByEnvironment ? { keyType: data.keyType, environment: data.environment } : undefined, tx);
      });
      res.status(201).json({ success: true, id, message: `${kind.singular} guardada y cifrada.` });
    })
  );

  // GET /:id/reveal — entrega el secreto de un registro y lo registra (falla cerrada)
  router.get(
    '/:id/reveal',
    revealLimiter,
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      const { purpose } = parse(revealQuery, req.query);
      const row = await findActive({ query }, req.user!, id);

      let secret: string;
      let extra: unknown;
      let notes: string;
      try {
        secret = decryptValue(row[kind.secretColumn], ctx(id, kind.secretColumn));
        extra = row[kind.extraColumn] ? JSON.parse(decryptValue(row[kind.extraColumn], ctx(id, kind.extraColumn))) : kind.extraField === 'additionalFields' ? [] : {};
        notes = decryptValue(row.encrypted_notes, ctx(id, 'encrypted_notes'));
      } catch (err) {
        console.error(`[cifrado] Error al descifrar ${kind.table}/${id}:`, err instanceof Error ? err.message : err);
        throw new HttpError(500, 'DECRYPT_FAILED', 'No se pudo descifrar este registro. Revisa la clave maestra configurada.');
      }

      await audit(req, `${purpose}_${kind.type}`, id, row.title);
      res.json({ [kind.secretField]: secret, [kind.extraField]: extra, notes });
    })
  );

  // PUT /:id — editar (exige la versión leída)
  router.put(
    '/:id',
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      const data = parse(kind.updateSchema, req.body) as Record<string, any>;
      const user = req.user!;
      assertEnvironment(user, data.environment);

      const version = await transaction(async (tx) => {
        const row = await findActive(tx, user, id, true);
        if (row.version !== data.version) {
          throw new HttpError(409, 'VERSION_CONFLICT', 'Otra persona modificó este registro mientras lo editabas. Recarga y vuelve a intentarlo.');
        }

        const sets: string[] = kind.plain.map((c, i) => `${c.db} = $${i + 2}`);
        const params: unknown[] = [id, ...plainValues(data)];
        const add = (column: string, value: unknown) => {
          params.push(value);
          sets.push(`${column} = $${params.length}`);
        };

        let rotated = false;
        if (typeof data[kind.secretField] === 'string') {
          const previous = decryptValue(row[kind.secretColumn], ctx(id, kind.secretColumn));
          if (previous !== data[kind.secretField]) {
            const versionId = randomId();
            await tx.query(
              `INSERT INTO vault_secret_versions (id, item_type, item_id, encrypted_value, replaced_by) VALUES ($1, $2, $3, $4, $5)`,
              [versionId, kind.type, id, encryptValue(previous, aad('vault_secret_versions', versionId, 'value')), user.email]
            );
            await tx.query(
              `DELETE FROM vault_secret_versions WHERE item_type = $1 AND item_id = $2 AND id NOT IN (
                 SELECT id FROM vault_secret_versions WHERE item_type = $1 AND item_id = $2 ORDER BY replaced_at DESC LIMIT ${MAX_VERSIONS})`,
              [kind.type, id]
            );
            add(kind.secretColumn, encryptValue(data[kind.secretField], ctx(id, kind.secretColumn)));
            rotated = true;
          }
        }
        // Campos omitidos se conservan (antes se borraban, M-04)
        const enc = encryptFields(id, data);
        if (enc.extra !== undefined) add(kind.extraColumn, enc.extra);
        if (enc.notes !== undefined) add('encrypted_notes', enc.notes);
        add('is_favorite', data.isFavorite);
        add('tags', data.tags);
        add('updated_by', user.email);
        add('updated_by_id', user.id);

        const [updated] = await tx.query<{ version: number }>(
          `UPDATE ${kind.table} SET ${sets.join(', ')}, version = version + 1, updated_at = NOW() WHERE id = $1 RETURNING version`,
          params
        );
        await audit(req, `UPDATE_${kind.type}`, id, data.title, { secretChanged: rotated }, tx);
        return updated.version;
      });
      res.json({ success: true, version, message: `${kind.singular} actualizada.` });
    })
  );

  // PUT /:id/favorite — marcar o desmarcar sin tocar secretos
  router.put(
    '/:id/favorite',
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      const isFavorite = req.body?.isFavorite === true;
      const filter = access(req.user!, 3);
      const rows = await query<{ version: number }>(
        `UPDATE ${kind.table} SET is_favorite = $2, version = version + 1 WHERE id = $1 AND deleted_at IS NULL${filter.sql} RETURNING version`,
        [id, isFavorite, ...filter.params]
      );
      if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', `${kind.singular} no encontrada.`);
      res.json({ success: true, version: rows[0].version });
    })
  );

  // DELETE /:id — a la papelera
  router.delete(
    '/:id',
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      const user = req.user!;
      await transaction(async (tx) => {
        const row = await findActive(tx, user, id, true);
        await tx.query(`UPDATE ${kind.table} SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1`, [id, user.email]);
        await audit(req, `TRASH_${kind.type}`, id, row.title, undefined, tx);
      });
      res.json({ success: true, message: `${kind.singular} enviada a la papelera.` });
    })
  );

  // POST /:id/restore — admin
  router.post(
    '/:id/restore',
    requireAdmin,
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      await transaction(async (tx) => {
        const [row] = await tx.query<{ title: string }>(
          `UPDATE ${kind.table} SET deleted_at = NULL, deleted_by = NULL, version = version + 1, updated_at = NOW()
           WHERE id = $1 AND deleted_at IS NOT NULL RETURNING title`,
          [id]
        );
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'No está en la papelera.');
        await audit(req, `RESTORE_${kind.type}`, id, row.title, undefined, tx);
      });
      res.json({ success: true, message: `${kind.singular} restaurada.` });
    })
  );

  // DELETE /:id/purge — eliminación definitiva desde la papelera (admin)
  router.delete(
    '/:id/purge',
    requireAdmin,
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      await transaction(async (tx) => {
        const [row] = await tx.query<{ title: string }>(`DELETE FROM ${kind.table} WHERE id = $1 AND deleted_at IS NOT NULL RETURNING title`, [id]);
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'Solo se puede eliminar definitivamente lo que está en la papelera.');
        await tx.query('DELETE FROM vault_secret_versions WHERE item_type = $1 AND item_id = $2', [kind.type, id]);
        await audit(req, `PURGE_${kind.type}`, id, row.title, undefined, tx);
      });
      res.json({ success: true, message: `${kind.singular} eliminada definitivamente.` });
    })
  );

  // GET /:id/versions — historial de valores anteriores (admin, sin el valor)
  router.get(
    '/:id/versions',
    requireAdmin,
    handler(async (req, res) => {
      const { id } = parse(idParam, req.params);
      const rows = await query('SELECT id, replaced_by, replaced_at FROM vault_secret_versions WHERE item_type = $1 AND item_id = $2 ORDER BY replaced_at DESC', [kind.type, id]);
      res.json({ items: rows.map((r: any) => ({ id: r.id, replacedBy: r.replaced_by, replacedAt: r.replaced_at })) });
    })
  );

  // GET /versions/:versionId/reveal — valor anterior (admin, auditado)
  router.get(
    '/versions/:versionId/reveal',
    requireAdmin,
    revealLimiter,
    handler(async (req, res) => {
      const { versionId } = parse(versionParam, req.params);
      const [row] = await query<{ item_id: string; encrypted_value: string }>(
        'SELECT item_id, encrypted_value FROM vault_secret_versions WHERE id = $1 AND item_type = $2',
        [versionId, kind.type]
      );
      if (!row) throw new HttpError(404, 'NOT_FOUND', 'Versión no encontrada.');
      const [item] = await query<{ title: string }>(`SELECT title FROM ${kind.table} WHERE id = $1`, [row.item_id]);
      const value = decryptValue(row.encrypted_value, aad('vault_secret_versions', versionId, 'value'));
      await audit(req, `VIEW_${kind.type}_VERSION`, row.item_id, item?.title ?? '(sin título)', { versionId });
      res.json({ value });
    })
  );

  return router;
}

export const passwordRoutes = createItemRouter(PASSWORD_KIND);
export const keyRoutes = createItemRouter(KEY_KIND);
