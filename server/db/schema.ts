import { query } from './connection.js';
import { hashPassword, hashPin, generateSalt } from '../services/cryptoService.js';

export async function ensureDatabaseSchema(): Promise<void> {
  console.log('🛡️ Verificando esquema de base de datos PostgreSQL...');

  // 1. Extensión para UUIDs
  await query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`).catch(() => {});

  // 2. Tabla de Usuarios
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator',
      status TEXT NOT NULL DEFAULT 'active',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);

  // 3. Tabla de Contraseñas de Portales y Accesos Web
  await query(`
    CREATE TABLE IF NOT EXISTS vault_passwords (
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
    );
    CREATE INDEX IF NOT EXISTS idx_vp_category ON vault_passwords(category);
    CREATE INDEX IF NOT EXISTS idx_vp_favorite ON vault_passwords(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_vp_title ON vault_passwords(title);
  `);

  // 4. Tabla de Llaves, Tokens y Secretos Técnicos
  await query(`
    CREATE TABLE IF NOT EXISTS vault_keys (
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
    );
    CREATE INDEX IF NOT EXISTS idx_vk_key_type ON vault_keys(key_type);
    CREATE INDEX IF NOT EXISTS idx_vk_environment ON vault_keys(environment);
    CREATE INDEX IF NOT EXISTS idx_vk_favorite ON vault_keys(is_favorite);
    CREATE INDEX IF NOT EXISTS idx_vk_title ON vault_keys(title);
  `);

  // 5. Tabla de Configuración de PIN Maestro y Anti-Fuerza Bruta
  await query(`
    CREATE TABLE IF NOT EXISTS vault_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT single_row CHECK (id = 1)
    );
  `);

  // 6. Tabla de Bitácora Inmutable de Auditoría
  await query(`
    CREATE TABLE IF NOT EXISTS vault_audit_logs (
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
    );
    CREATE INDEX IF NOT EXISTS idx_val_event_type ON vault_audit_logs(event_type);
    CREATE INDEX IF NOT EXISTS idx_val_user_email ON vault_audit_logs(user_email);
    CREATE INDEX IF NOT EXISTS idx_val_created_at ON vault_audit_logs(created_at DESC);
  `);

  // 7. Semilla de Usuario Administrador Inicial si no existe
  await seedDefaultAdmin();

  // 8. Semilla de PIN Maestro si no existe
  await seedDefaultPin();

  console.log('✅ Esquema y tablas de base de datos verificadas exitosamente.');
}

async function seedDefaultAdmin(): Promise<void> {
  const existingUsers = await query(`SELECT id FROM users LIMIT 1;`);
  if (existingUsers.length === 0) {
    const defaultEmail = (process.env.DEFAULT_ADMIN_EMAIL || 'admin@f1.services').toLowerCase().trim();
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'AdminFortress2026!';
    const defaultName = process.env.DEFAULT_ADMIN_NAME || 'Administrador de Seguridad F1';
    const passwordHash = await hashPassword(defaultPassword);

    await query(
      `INSERT INTO users (email, name, password_hash, role, status) VALUES ($1, $2, $3, 'admin', 'active');`,
      [defaultEmail, defaultName, passwordHash]
    );
    console.log(`👤 Usuario Administrador creado: ${defaultEmail} (Contraseña inicial: ${defaultPassword})`);
  }
}

async function seedDefaultPin(): Promise<void> {
  const existingConfig = await query(`SELECT id FROM vault_config WHERE id = 1;`);
  if (existingConfig.length === 0) {
    const defaultPin = process.env.DEFAULT_VAULT_PIN || '1234';
    const salt = generateSalt();
    const pinHash = await hashPin(defaultPin, salt);

    await query(
      `INSERT INTO vault_config (id, pin_hash, pin_salt, failed_attempts) VALUES (1, $1, $2, 0);`,
      [pinHash, salt]
    );
    console.log(`🔐 PIN Maestro de 4 dígitos inicial configurado por defecto: ${defaultPin}`);
  }
}

