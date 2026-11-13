/**
 * Servidor de demostración local: PostgreSQL en memoria (PGlite), datos ficticios y el cliente compilado.
 * No usa variables de entorno reales ni se conecta a ninguna base. Uso: npm run build:client && npm run dev:demo
 * Las credenciales de demostración están en DEMO_USERS (solo existen en memoria mientras corre).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgliteDatabase } from '../tests/helpers.js';
import { setDatabase } from '../server/db/connection.js';
import { runMigrations } from '../server/db/migrations.js';
import { aad, encryptValue, hashPassword, hashPin, initCrypto, randomId } from '../server/services/cryptoService.js';
import { createApp } from '../server/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 3005);

export const DEMO_USERS = [
  { email: 'admin.demo@f1.services', name: 'Admin Demo', role: 'admin', password: 'Demo-Boveda-2026!', pin: '482915' },
  { email: 'operador.demo@f1.services', name: 'Operador Demo', role: 'operator', password: 'Demo-Boveda-2026!', pin: null },
];

async function main() {
  initCrypto({ masterKey: 'demo-master-key-solo-local-0123456789abcdef', jwtSecret: 'demo-jwt-secret-solo-local-0123456789abcdef' });
  const db = pgliteDatabase(new PGlite());
  setDatabase(db);
  await runMigrations(db);

  for (const u of DEMO_USERS) {
    await db.query(
      `INSERT INTO users (email, name, password_hash, role, pin_hash, key_environments) VALUES ($1, $2, $3, $4, $5, $6)`,
      [u.email, u.name, await hashPassword(u.password), u.role, u.pin ? await hashPin(u.pin) : null, u.role === 'admin' ? ['PROD', 'STAGING', 'QA', 'DEV'] : ['DEV', 'QA']]
    );
  }

  const samples = [
    { title: 'Portal de proveedores Entel', category: 'Proveedores', url: 'https://proveedores.example.com', username: 'f1.compras', password: 'Xk9!mP2@vL7#qR4s', fav: true, tags: ['chile', 'compras'] },
    { title: 'Correo corporativo — soporte', category: 'Correo', url: 'outlook.office.com', username: 'soporte@f1.services', password: 'Sop0rte-Seguro-2026', fav: false, tags: ['soporte'] },
    { title: 'Panel DNS', category: 'Infraestructura', url: 'https://dns.example.com', username: 'ops', password: 'dNs_r00t_9921!', fav: false, tags: ['infra'] },
  ];
  for (const s of samples) {
    const id = randomId();
    await db.query(
      `INSERT INTO vault_passwords (id, title, category, url, username, encrypted_password, encrypted_notes, is_favorite, tags, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'admin.demo@f1.services', 'admin.demo@f1.services')`,
      [id, s.title, s.category, s.url, s.username, encryptValue(s.password, aad('vault_passwords', id, 'encrypted_password')),
        encryptValue('Dato de demostración.', aad('vault_passwords', id, 'encrypted_notes')), s.fav, s.tags]
    );
  }
  const keys = [
    { title: 'API facturación', type: 'API_KEY', env: 'PROD', identifier: 'client_8842', secret: 'sk_live_demo_51HcXa9', expires: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10) },
    { title: 'Token CI', type: 'TOKEN', env: 'DEV', identifier: 'github-actions', secret: 'ghp_demo_token_000111', expires: null },
    { title: 'Bastión SSH', type: 'SSH_KEY', env: 'QA', identifier: 'ops@bastion-qa', secret: '-----BEGIN OPENSSH PRIVATE KEY-----\nDEMO\n-----END OPENSSH PRIVATE KEY-----', expires: null },
  ];
  for (const k of keys) {
    const id = randomId();
    await db.query(
      `INSERT INTO vault_keys (id, title, key_type, environment, identifier, encrypted_secret, expires_at, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'admin.demo@f1.services', 'admin.demo@f1.services')`,
      [id, k.title, k.type, k.env, k.identifier, encryptValue(k.secret, aad('vault_keys', id, 'encrypted_secret')), k.expires]
    );
  }

  const app = createApp({ isProduction: false, corsOrigins: [], trustProxy: false }, { staticDir: path.join(root, 'dist/client') });
  app.listen(PORT, '127.0.0.1', () => console.log(`[demo] Bóveda de demostración en http://localhost:${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
