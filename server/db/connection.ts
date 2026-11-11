import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const isProduction = process.env.NODE_ENV === 'production';
const requiresSsl = Boolean(
  connectionString &&
  (connectionString.includes('sslmode=require') ||
   connectionString.includes('neon.tech') ||
   connectionString.includes('supabase') ||
   (isProduction && !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')))
);

export const pool = new pg.Pool({
  connectionString: connectionString || 'postgresql://postgres:postgres@localhost:5432/portal_boveda',
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (err) {
    console.warn('⚠️ Advertencia: No se pudo conectar a PostgreSQL todavía.', err instanceof Error ? err.message : err);
    return false;
  }
}
