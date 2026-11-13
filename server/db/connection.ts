import pg from 'pg';
import type { DatabaseSsl } from '../config.js';

/** Algo que ejecuta una consulta parametrizada: el pool o una transacción. */
export interface Queryable {
  query<T = any>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  /** Ejecuta `fn` en una transacción real (BEGIN/COMMIT). Los FOR UPDATE dentro sí bloquean (C-02). */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

let current: Database | null = null;

export function setDatabase(db: Database): void {
  current = db;
}

export function db(): Database {
  if (!current) throw new Error('La base de datos no fue inicializada.');
  return current;
}

/** Atajos sobre la base activa. */
export const query = <T = any>(text: string, params?: unknown[]) => db().query<T>(text, params);
export const transaction = <T>(fn: (tx: Queryable) => Promise<T>) => db().transaction(fn);

export function createPgDatabase(options: { connectionString: string; ssl: DatabaseSsl }): Database {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    ssl: options.ssl || undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000,
    application_name: 'f1-keyvault',
  });

  // Sin este manejador, un error en una conexión inactiva (reinicio de Postgres) tumba el proceso (M-03).
  pool.on('error', (err) => {
    console.error('[db] Error en una conexión inactiva del pool:', err.message);
  });

  const wrap = (client: pg.PoolClient | pg.Pool): Queryable => ({
    async query<T>(text: string, params?: unknown[]) {
      const res = await client.query(text, params as any[]);
      return res.rows as T[];
    },
  });

  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    async ping() {
      try {
        await pool.query('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}

/** Espera a que PostgreSQL responda antes de seguir (Railway puede levantar la BD después del servicio). */
export async function waitForDatabase(database: Database, attempts = 10, delayMs = 3000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    if (await database.ping()) return;
    console.warn(`[db] PostgreSQL no responde (intento ${i}/${attempts}).`);
    if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('No fue posible conectar con PostgreSQL.');
}
