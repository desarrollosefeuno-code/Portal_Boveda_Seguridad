import type { AppConfig } from '../config.js';
import { KNOWN_PUBLIC_SECRETS } from '../config.js';
import type { Database } from './connection.js';
import { aad, decryptValue, encryptValue, hashPassword, isLegacyPasswordHash, needsReencryption, verifyPassword } from '../services/cryptoService.js';

/**
 * Tareas al arrancar, después de las migraciones (C-04):
 * - Crea el primer admin solo si se definieron DEFAULT_ADMIN_EMAIL y DEFAULT_ADMIN_PASSWORD (robusta). Nunca escribe la clave en los logs.
 * - Obliga a cambiar la contraseña a quien siga con la clave publicada en versiones anteriores.
 */
export async function bootstrapUsers(database: Database, config: AppConfig): Promise<void> {
  const [{ count }] = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');

  if (count === '0') {
    if (!config.adminSeed) {
      console.warn('[arranque] No hay usuarios. Define DEFAULT_ADMIN_EMAIL y DEFAULT_ADMIN_PASSWORD para crear el primer administrador.');
      return;
    }
    const hash = await hashPassword(config.adminSeed.password);
    await database.query(
      `INSERT INTO users (email, name, password_hash, role, status, must_change_password)
       VALUES ($1, $2, $3, 'admin', 'active', TRUE)`,
      [config.adminSeed.email, config.adminSeed.name, hash]
    );
    console.log(`[arranque] Administrador inicial creado para ${config.adminSeed.email}. Deberá cambiar su contraseña al entrar.`);
    return;
  }

  // Cuentas con formato de hash heredado: revisa si alguna conserva una contraseña publicada.
  const legacy = await database.query<{ id: string; email: string; password_hash: string }>(
    'SELECT id, email, password_hash FROM users WHERE must_change_password = FALSE'
  );
  for (const user of legacy.filter((u) => isLegacyPasswordHash(u.password_hash))) {
    for (const published of KNOWN_PUBLIC_SECRETS) {
      if (await verifyPassword(published, user.password_hash)) {
        await database.query(
          'UPDATE users SET must_change_password = TRUE, session_version = session_version + 1 WHERE id = $1',
          [user.id]
        );
        console.warn(`[arranque] ${user.email} usaba una contraseña publicada: se le exigirá cambiarla.`);
        break;
      }
    }
  }
}

interface ReencryptTarget {
  table: 'vault_passwords' | 'vault_keys' | 'vault_secret_versions';
  columns: string[];
}

const TARGETS: ReencryptTarget[] = [
  { table: 'vault_passwords', columns: ['encrypted_password', 'encrypted_additional_fields', 'encrypted_notes'] },
  { table: 'vault_keys', columns: ['encrypted_secret', 'encrypted_additional_data', 'encrypted_notes'] },
  { table: 'vault_secret_versions', columns: ['encrypted_value'] },
];

/**
 * Re-cifra a v2 con la clave actual todo valor en formato v1 o con la clave anterior (A-05, M-09).
 * Corre en segundo plano tras abrir el puerto: la lectura funciona con ambos formatos mientras tanto.
 */
export async function reencryptLegacyData(database: Database): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  for (const target of TARGETS) {
    const rows = await database.query<Record<string, string | null> & { id: string }>(
      `SELECT id, ${target.columns.join(', ')} FROM ${target.table}`
    );
    for (const row of rows) {
      const pending = target.columns.filter((c) => needsReencryption(row[c]));
      if (pending.length === 0) continue;
      try {
        const values = pending.map((column) => {
          const field = column === 'encrypted_value' ? 'value' : column;
          const context = aad(target.table, row.id, field);
          const plain = decryptValue(row[column], context);
          return plain ? encryptValue(plain, context) : null;
        });
        const sets = pending.map((c, i) => `${c} = $${i + 2}`).join(', ');
        await database.query(`UPDATE ${target.table} SET ${sets} WHERE id = $1`, [row.id, ...values]);
        updated++;
      } catch (err) {
        failed++;
        console.error(`[cifrado] No se pudo re-cifrar ${target.table}/${row.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }
  if (updated || failed) console.log(`[cifrado] Re-cifrado a v2: ${updated} registros, ${failed} con error.`);
  return { updated, failed };
}
