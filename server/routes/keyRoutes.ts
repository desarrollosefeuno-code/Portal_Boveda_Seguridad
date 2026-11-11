import { Router } from 'express';
import { query } from '../db/connection.js';
import { encryptValue, decryptValue } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';

const router = Router();

router.use(requireAuth);
router.use(requireVaultUnlocked);

// GET /api/vault/keys
router.get('/', async (req, res) => {
  try {
    const rows = await query<{
      id: string;
      title: string;
      key_type: string;
      environment: string;
      category: string;
      identifier: string | null;
      encrypted_secret: string;
      public_key: string | null;
      encrypted_additional_data: string | null;
      encrypted_notes: string | null;
      expires_at: string | null;
      is_favorite: boolean;
      tags: string[];
      created_by: string;
      updated_by: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT 
        id, title, key_type, environment, category, identifier,
        encrypted_secret, public_key, encrypted_additional_data, encrypted_notes,
        expires_at, is_favorite, tags, created_by, updated_by, created_at, updated_at
      FROM vault_keys
      ORDER BY is_favorite DESC, updated_at DESC;
    `);

    const items = rows.map((row) => {
      let secret = '';
      let additionalData: any = {};
      let notes = '';

      try {
        secret = decryptValue(row.encrypted_secret);
      } catch (e) {
        secret = '*** ERROR DE DESCIFRADO ***';
      }

      if (row.encrypted_additional_data) {
        try {
          const rawJson = decryptValue(row.encrypted_additional_data);
          additionalData = JSON.parse(rawJson);
        } catch {
          additionalData = {};
        }
      }

      if (row.encrypted_notes) {
        try {
          notes = decryptValue(row.encrypted_notes);
        } catch {
          notes = '';
        }
      }

      return {
        id: row.id,
        title: row.title,
        keyType: row.key_type,
        environment: row.environment,
        category: row.category,
        identifier: row.identifier || '',
        secret,
        publicKey: row.public_key || '',
        additionalData,
        notes,
        expiresAt: row.expires_at || null,
        isFavorite: Boolean(row.is_favorite),
        tags: Array.isArray(row.tags) ? row.tags : [],
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    res.status(200).json({ items });
  } catch (err: any) {
    console.error('Error al obtener llaves y tokens:', err);
    res.status(500).json({ error: 'Error al consultar llaves y tokens.' });
  }
});

// POST /api/vault/keys
router.post('/', async (req, res) => {
  const {
    title,
    keyType,
    environment,
    category,
    identifier,
    secret,
    publicKey,
    additionalData,
    notes,
    expiresAt,
    isFavorite,
    tags,
  } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'El nombre o descripción de la llave es obligatorio.' });
    return;
  }

  if (!secret || typeof secret !== 'string') {
    res.status(400).json({ error: 'El secreto, token o llave principal es obligatorio.' });
    return;
  }

  try {
    const encryptedSecret = encryptValue(secret);
    const encryptedAdditional = additionalData && Object.keys(additionalData).length > 0
      ? encryptValue(JSON.stringify(additionalData))
      : null;
    const encryptedNotes = typeof notes === 'string' && notes.trim()
      ? encryptValue(notes.trim())
      : null;

    const author = req.user?.email || 'Usuario';
    const cleanTags = Array.isArray(tags) ? tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    const result = await query<{ id: string }>(
      `
      INSERT INTO vault_keys (
        title, key_type, environment, category, identifier,
        encrypted_secret, public_key, encrypted_additional_data, encrypted_notes,
        expires_at, is_favorite, tags, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      RETURNING id;
    `,
      [
        title.trim(),
        (keyType || 'API_KEY').trim(),
        (environment || 'PROD').trim(),
        (category || 'General').trim(),
        identifier ? identifier.trim() : null,
        encryptedSecret,
        publicKey ? publicKey.trim() : null,
        encryptedAdditional,
        encryptedNotes,
        expiresAt || null,
        Boolean(isFavorite),
        cleanTags,
        author,
      ]
    );

    const newId = result[0]?.id;

    await logAuditEvent({
      eventType: 'CREATE_KEY',
      targetType: 'KEY',
      targetId: newId,
      targetTitle: title.trim(),
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { keyType, environment },
    });

    res.status(201).json({ success: true, id: newId, message: 'Llave/Token guardado y cifrado con AES-256-GCM.' });
  } catch (err: any) {
    console.error('Error al guardar llave/token:', err);
    res.status(500).json({ error: 'Error al registrar llave o token.' });
  }
});

// PUT /api/vault/keys/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    title,
    keyType,
    environment,
    category,
    identifier,
    secret,
    publicKey,
    additionalData,
    notes,
    expiresAt,
    isFavorite,
    tags,
  } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  try {
    const existing = await query<{ encrypted_secret: string }>(
      'SELECT encrypted_secret FROM vault_keys WHERE id = $1;',
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Llave no encontrada.' });
      return;
    }

    let encryptedSecret = existing[0].encrypted_secret;
    if (secret && typeof secret === 'string' && secret.trim() && secret !== '••••••••••••') {
      encryptedSecret = encryptValue(secret);
    }

    const encryptedAdditional = additionalData && Object.keys(additionalData).length > 0
      ? encryptValue(JSON.stringify(additionalData))
      : null;
    const encryptedNotes = typeof notes === 'string' && notes.trim()
      ? encryptValue(notes.trim())
      : null;

    const author = req.user?.email || 'Usuario';
    const cleanTags = Array.isArray(tags) ? tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    await query(
      `
      UPDATE vault_keys
      SET 
        title = $1,
        key_type = $2,
        environment = $3,
        category = $4,
        identifier = $5,
        encrypted_secret = $6,
        public_key = $7,
        encrypted_additional_data = $8,
        encrypted_notes = $9,
        expires_at = $10,
        is_favorite = $11,
        tags = $12,
        updated_by = $13,
        updated_at = NOW()
      WHERE id = $14;
    `,
      [
        title.trim(),
        (keyType || 'API_KEY').trim(),
        (environment || 'PROD').trim(),
        (category || 'General').trim(),
        identifier ? identifier.trim() : null,
        encryptedSecret,
        publicKey ? publicKey.trim() : null,
        encryptedAdditional,
        encryptedNotes,
        expiresAt || null,
        Boolean(isFavorite),
        cleanTags,
        author,
        id,
      ]
    );

    await logAuditEvent({
      eventType: 'UPDATE_KEY',
      targetType: 'KEY',
      targetId: id,
      targetTitle: title.trim(),
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { keyType, environment },
    });

    res.status(200).json({ success: true, message: 'Llave/Token actualizado correctamente.' });
  } catch (err: any) {
    console.error('Error al actualizar llave/token:', err);
    res.status(500).json({ error: 'Error al actualizar llave/token.' });
  }
});

// DELETE /api/vault/keys/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await query<{ title: string; key_type: string }>(
      'SELECT title, key_type FROM vault_keys WHERE id = $1;',
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Llave no encontrada.' });
      return;
    }

    await query('DELETE FROM vault_keys WHERE id = $1;', [id]);

    await logAuditEvent({
      eventType: 'DELETE_KEY',
      targetType: 'KEY',
      targetId: id,
      targetTitle: existing[0].title,
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { keyType: existing[0].key_type },
    });

    res.status(200).json({ success: true, message: 'Llave/Token eliminado exitosamente.' });
  } catch (err: any) {
    console.error('Error al eliminar llave/token:', err);
    res.status(500).json({ error: 'Error al eliminar llave.' });
  }
});

// POST /api/vault/keys/:id/log-action (Auditar copiado o visualización de token/secreto)
router.post('/:id/log-action', async (req, res) => {
  const { id } = req.params;
  const { action, fieldName } = req.body || {};

  try {
    const existing = await query<{ title: string; key_type: string }>(
      'SELECT title, key_type FROM vault_keys WHERE id = $1;',
      [id]
    );
    if (existing.length > 0) {
      await logAuditEvent({
        eventType: action === 'COPY' ? 'COPY_KEY' : 'VIEW_KEY',
        targetType: 'KEY',
        targetId: id,
        targetTitle: existing[0].title,
        userEmail: req.user!.email,
        userName: req.user!.name,
        req,
        details: { keyType: existing[0].key_type, field: fieldName || 'secret' },
      });
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: true });
  }
});

export default router;

