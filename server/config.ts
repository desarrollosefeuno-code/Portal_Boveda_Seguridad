/**
 * Configuración validada al arrancar (C-03). Si falta un secreto o es débil, el servidor no arranca:
 * no existen valores por defecto para claves, contraseñas ni PIN.
 */

/** Valores publicados en versiones anteriores (código, README y .env.example): nunca se aceptan. */
export const KNOWN_PUBLIC_SECRETS = new Set([
  'f1_fortress_master_secret_aes_256_gcm_ultra_secure_2026_key',
  'f1_fortress_default_master_encryption_key_2026',
  'f1_keyvault_jwt_session_signing_secret_super_long_32chars_minimum',
  'f1_keyvault_session_secret_2026',
  'AdminFortress2026!',
]);

export type DatabaseSsl = false | { rejectUnauthorized: boolean; ca?: string };

export interface AppConfig {
  isProduction: boolean;
  port: number;
  databaseUrl: string;
  databaseSsl: DatabaseSsl;
  masterKey: string;
  previousMasterKey?: string;
  jwtSecret: string;
  corsOrigins: string[];
  trustProxy: number | boolean;
  adminSeed?: { email: string; password: string; name: string };
}

export class ConfigError extends Error {}

function secret(env: NodeJS.ProcessEnv, name: string, min = 32): string {
  const value = env[name]?.trim();
  if (!value) throw new ConfigError(`Falta la variable ${name}.`);
  if (value.length < min) throw new ConfigError(`${name} debe tener al menos ${min} caracteres.`);
  if (KNOWN_PUBLIC_SECRETS.has(value)) throw new ConfigError(`${name} usa un valor publicado en el repositorio: genera uno nuevo.`);
  return value;
}

function parseSsl(env: NodeJS.ProcessEnv, url: string): DatabaseSsl {
  const mode = (env.DATABASE_SSL || '').trim().toLowerCase();
  let host = '';
  try { host = new URL(url).hostname; } catch { throw new ConfigError('DATABASE_URL no es una URL válida.'); }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, '\n').trim() || undefined;

  if (mode === 'disable') return false;
  if (mode === 'no-verify') return { rejectUnauthorized: false };
  if (mode === 'verify' || mode === '') {
    // Red privada de Railway y base local: sin TLS salvo que se pida explícitamente.
    if (mode === '' && (local || host.endsWith('.railway.internal')) && !url.includes('sslmode=require')) return false;
    return { rejectUnauthorized: true, ca };
  }
  throw new ConfigError('DATABASE_SSL debe ser verify, no-verify o disable.');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new ConfigError('Falta la variable DATABASE_URL.');

  const masterKey = secret(env, 'MASTER_ENCRYPTION_KEY');
  const jwtSecret = secret(env, 'JWT_SECRET');
  if (masterKey === jwtSecret) throw new ConfigError('MASTER_ENCRYPTION_KEY y JWT_SECRET deben ser distintos.');
  const previousMasterKey = env.MASTER_ENCRYPTION_KEY_PREVIOUS?.trim() || undefined;
  if (previousMasterKey && previousMasterKey === masterKey) {
    throw new ConfigError('MASTER_ENCRYPTION_KEY_PREVIOUS debe ser distinta de la clave actual.');
  }

  const corsOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  for (const origin of corsOrigins) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new ConfigError(`CORS_ORIGINS contiene un origen inválido: ${origin}`);
  }

  const rawProxy = env.TRUST_PROXY?.trim();
  const trustProxy = rawProxy === undefined || rawProxy === ''
    ? (isProduction ? 1 : false)
    : rawProxy === 'false' ? false : rawProxy === 'true' ? true : Number.parseInt(rawProxy, 10);
  if (typeof trustProxy === 'number' && (!Number.isInteger(trustProxy) || trustProxy < 0)) {
    throw new ConfigError('TRUST_PROXY debe ser un número de saltos, true o false.');
  }

  let adminSeed: AppConfig['adminSeed'];
  const seedEmail = env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  const seedPassword = env.DEFAULT_ADMIN_PASSWORD;
  if (seedEmail && seedPassword) {
    if (seedPassword.length < 14 || KNOWN_PUBLIC_SECRETS.has(seedPassword)) {
      throw new ConfigError('DEFAULT_ADMIN_PASSWORD debe tener al menos 14 caracteres y no puede ser la contraseña publicada.');
    }
    adminSeed = { email: seedEmail, password: seedPassword, name: env.DEFAULT_ADMIN_NAME?.trim() || 'Administrador de Seguridad F1' };
  }

  const port = Number.parseInt(env.PORT || '3001', 10);

  return {
    isProduction,
    port: Number.isInteger(port) ? port : 3001,
    databaseUrl,
    databaseSsl: parseSsl(env, databaseUrl),
    masterKey,
    previousMasterKey,
    jwtSecret,
    corsOrigins,
    trustProxy,
    adminSeed,
  };
}
