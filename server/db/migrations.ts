import type { Database } from './connection.js';

/**
 * Migraciones versionadas (M-07). Cada una corre una sola vez, dentro de una transacción y con un candado
 * de asesoría para que dos instancias no migren a la vez. Una sentencia por elemento del arreglo.
 * No se edita una migración ya publicada: los cambios van en una nueva.
 */
interface Migration {
  version: number;
  name: string;
  statements: string[];
}

const KEY_TYPES = `'API_KEY','TOKEN','SSH_KEY','DATABASE','PIN_CODE','CERTIFICATE'`;
const ENVIRONMENTS = `'PROD','STAGING','QA','DEV'`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'esquema inicial (v1.0.0)',
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        status TEXT NOT NULL DEFAULT 'active',
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS vault_passwords (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'General',
        url TEXT,
        username TEXT,
        encrypted_password TEXT NOT NULL,
        encrypted_additional_fields TEXT,
        encrypted_notes TEXT,
        is_favorite BOOLEAN DEFAULT FALSE,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS vault_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        key_type TEXT NOT NULL DEFAULT 'API_KEY',
        environment TEXT NOT NULL DEFAULT 'PROD',
        category TEXT NOT NULL DEFAULT 'General',
        identifier TEXT,
        encrypted_secret TEXT NOT NULL,
        public_key TEXT,
        encrypted_additional_data TEXT,
        encrypted_notes TEXT,
        expires_at DATE,
        is_favorite BOOLEAN DEFAULT FALSE,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_by TEXT,
        updated_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE TABLE IF NOT EXISTS vault_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        target_title TEXT,
        user_email TEXT NOT NULL,
        user_name TEXT,
        ip_address TEXT,
        user_agent TEXT,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_val_event_type ON vault_audit_logs(event_type)`,
      `CREATE INDEX IF NOT EXISTS idx_val_user_email ON vault_audit_logs(user_email)`,
      `CREATE INDEX IF NOT EXISTS idx_val_created_at ON vault_audit_logs(created_at DESC)`,
    ],
  },
  {
    version: 2,
    name: 'PIN personal, sesiones revocables, papelera, historial, solicitudes de admin y bitácora inmutable',
    statements: [
      // Usuarios: PIN personal (A-03), revocación de sesiones (A-01/A-02), bloqueo de login (A-06), permisos por entorno (A-04)
      `ALTER TABLE users
        ADD COLUMN IF NOT EXISTS pin_hash TEXT,
        ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS vault_epoch INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS key_environments TEXT[] NOT NULL DEFAULT ARRAY['PROD','STAGING','QA','DEV']::TEXT[]`,
      `UPDATE users SET role = 'operator' WHERE role NOT IN ('admin','operator')`,
      `UPDATE users SET status = 'disabled' WHERE status NOT IN ('active','disabled')`,
      `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','operator'))`,
      `ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active','disabled'))`,
      `ALTER TABLE users ADD CONSTRAINT users_email_lower_check CHECK (email = lower(email))`,
      // UNIQUE(email) ya crea su índice: el adicional era redundante (M-07)
      `DROP INDEX IF EXISTS idx_users_email`,

      // Contraseñas: papelera (M-05), control de versión (concurrencia) y autores con FK
      `ALTER TABLE vault_passwords
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by TEXT,
        ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE vault_passwords ALTER COLUMN is_favorite SET NOT NULL`,
      `ALTER TABLE vault_passwords ALTER COLUMN tags SET NOT NULL`,
      `DROP INDEX IF EXISTS idx_vp_favorite`,
      `DROP INDEX IF EXISTS idx_vp_title`,
      `CREATE INDEX IF NOT EXISTS idx_vp_active_order ON vault_passwords (is_favorite DESC, updated_at DESC) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_vp_deleted ON vault_passwords (deleted_at DESC) WHERE deleted_at IS NOT NULL`,

      // Llaves: igual que contraseñas + catálogo cerrado de tipo y entorno
      `ALTER TABLE vault_keys
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS deleted_by TEXT,
        ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES users(id) ON DELETE SET NULL`,
      `ALTER TABLE vault_keys ALTER COLUMN is_favorite SET NOT NULL`,
      `ALTER TABLE vault_keys ALTER COLUMN tags SET NOT NULL`,
      `UPDATE vault_keys SET key_type = 'API_KEY' WHERE key_type NOT IN (${KEY_TYPES})`,
      `UPDATE vault_keys SET environment = 'PROD' WHERE environment NOT IN (${ENVIRONMENTS})`,
      `ALTER TABLE vault_keys ADD CONSTRAINT vault_keys_type_check CHECK (key_type IN (${KEY_TYPES}))`,
      `ALTER TABLE vault_keys ADD CONSTRAINT vault_keys_env_check CHECK (environment IN (${ENVIRONMENTS}))`,
      `DROP INDEX IF EXISTS idx_vk_favorite`,
      `DROP INDEX IF EXISTS idx_vk_title`,
      `DROP INDEX IF EXISTS idx_vk_key_type`,
      `CREATE INDEX IF NOT EXISTS idx_vk_active_order ON vault_keys (environment, is_favorite DESC, updated_at DESC) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_vk_deleted ON vault_keys (deleted_at DESC) WHERE deleted_at IS NOT NULL`,

      // Historial de secretos reemplazados (M-05): permite recuperar el valor anterior tras una rotación
      `CREATE TABLE IF NOT EXISTS vault_secret_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_type TEXT NOT NULL CHECK (item_type IN ('PASSWORD','KEY')),
        item_id UUID NOT NULL,
        encrypted_value TEXT NOT NULL,
        replaced_by TEXT NOT NULL,
        replaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_vsv_item ON vault_secret_versions (item_type, item_id, replaced_at DESC)`,

      // Segregación de funciones (A-09): otorgar el rol admin requiere aprobación de otro admin
      `CREATE TABLE IF NOT EXISTS admin_role_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
        requested_by_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
        decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
        decided_by_email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        decided_at TIMESTAMPTZ
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_arr_pending ON admin_role_requests (target_user_id) WHERE status = 'pending'`,

      // Bitácora inmutable (A-08): la base rechaza UPDATE, DELETE y TRUNCATE
      `ALTER TABLE vault_audit_logs ADD COLUMN IF NOT EXISTS user_id UUID`,
      `ALTER TABLE vault_audit_logs ALTER COLUMN created_at SET NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_val_user_created ON vault_audit_logs (user_id, created_at DESC)`,
      `CREATE OR REPLACE FUNCTION vault_audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          RAISE EXCEPTION 'La bitácora de auditoría es inmutable: % no está permitido', TG_OP;
        END;
      $$`,
      `DROP TRIGGER IF EXISTS trg_val_immutable ON vault_audit_logs`,
      `CREATE TRIGGER trg_val_immutable BEFORE UPDATE OR DELETE ON vault_audit_logs
        FOR EACH ROW EXECUTE FUNCTION vault_audit_logs_immutable()`,
      `DROP TRIGGER IF EXISTS trg_val_no_truncate ON vault_audit_logs`,
      `CREATE TRIGGER trg_val_no_truncate BEFORE TRUNCATE ON vault_audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION vault_audit_logs_immutable()`,
    ],
  },
];

export async function runMigrations(database: Database): Promise<number[]> {
  await database.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const applied: number[] = [];
  for (const migration of MIGRATIONS) {
    const done = await database.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(7314001)');
      const rows = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migration.version]);
      if (rows.length > 0) return false;
      for (const statement of migration.statements) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
      return true;
    });
    if (done) {
      applied.push(migration.version);
      console.log(`[db] Migración ${migration.version} aplicada: ${migration.name}`);
    }
  }
  return applied;
}
