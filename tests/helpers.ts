import { PGlite } from '@electric-sql/pglite';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Database, Queryable } from '../server/db/connection.js';
import { setDatabase } from '../server/db/connection.js';
import { runMigrations } from '../server/db/migrations.js';
import { initCrypto } from '../server/services/cryptoService.js';
import { createApp } from '../server/app.js';

export const TEST_SECRETS = {
  masterKey: 'test-master-key-0123456789abcdefghijklmnopqrstuvwxyz',
  jwtSecret: 'test-jwt-secret-0123456789abcdefghijklmnopqrstuvwxyz',
};

/** Adaptador de PGlite (PostgreSQL en memoria) con la misma interfaz que el pool real. */
export function pgliteDatabase(pg: PGlite): Database {
  const wrap = (q: { query: PGlite['query'] }): Queryable => ({
    async query<T>(text: string, params?: unknown[]) {
      const res = await q.query<T>(text, params as any[]);
      return res.rows;
    },
  });
  return {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as any))),
    ping: async () => true,
    close: () => pg.close(),
  };
}

export interface TestContext {
  db: Database;
  baseUrl: string;
  server: Server;
  close: () => Promise<void>;
}

export async function startTestApp(): Promise<TestContext> {
  initCrypto(TEST_SECRETS);
  const pg = new PGlite();
  const db = pgliteDatabase(pg);
  setDatabase(db);
  await runMigrations(db);
  const app = createApp({ isProduction: false, corsOrigins: [], trustProxy: true });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    db,
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await new Promise((r) => server.close(r));
      await pg.close();
    },
  };
}

let ipCounter = 1;

/** Cliente HTTP con su propio "navegador": guarda cookies y usa una IP distinta (límites por IP). */
export class Client {
  cookies = new Map<string, string>();
  ip = `10.0.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

  constructor(private baseUrl: string) {}

  async request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': this.ip,
        ...(method !== 'GET' ? { 'x-f1-vault': '1' } : {}),
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      const expired = attrs.some((a) => /expires=thu, 01 jan 1970/i.test(a.trim())) || value === '';
      if (expired) this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data, headers: res.headers };
  }

  get = (path: string) => this.request('GET', path);
  post = (path: string, body?: unknown) => this.request('POST', path, body ?? {});
  put = (path: string, body?: unknown) => this.request('PUT', path, body ?? {});
  del = (path: string) => this.request('DELETE', path);
}
