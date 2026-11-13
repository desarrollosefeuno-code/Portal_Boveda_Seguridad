import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client, startTestApp, type TestContext } from './helpers.js';
import { hashPassword, hashPin } from '../server/services/cryptoService.js';
import { runMigrations } from '../server/db/migrations.js';
import { bootstrapUsers } from '../server/db/bootstrap.js';
import { loadConfig } from '../server/config.js';

let ctx: TestContext;
const PASSWORD = 'Clave-de-prueba-2026!x';
const PIN = '482915';

async function createUser(email: string, opts: { role?: 'admin' | 'operator'; pin?: string; envs?: string[]; mustChange?: boolean } = {}) {
  const [row] = await ctx.db.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, role, status, must_change_password, pin_hash, key_environments)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7) RETURNING id`,
    [email, email.split('@')[0], await hashPassword(PASSWORD), opts.role ?? 'operator', opts.mustChange ?? false, opts.pin ? await hashPin(opts.pin) : null, opts.envs ?? ['PROD', 'STAGING', 'QA', 'DEV']]
  );
  return row.id;
}

async function login(email: string) {
  const c = new Client(ctx.baseUrl);
  const res = await c.post('/api/auth/login', { email, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return c;
}

async function loginUnlocked(email: string) {
  const c = await login(email);
  const res = await c.post('/api/vault/unlock', { pin: PIN });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return c;
}

before(async () => {
  ctx = await startTestApp();
});
after(async () => {
  await ctx.close();
});

describe('Configuración (C-03, C-04)', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', MASTER_ENCRYPTION_KEY: 'x'.repeat(40), JWT_SECRET: 'y'.repeat(40) };

  test('no arranca sin secretos', () => {
    assert.throws(() => loadConfig({ ...base, MASTER_ENCRYPTION_KEY: undefined }), /MASTER_ENCRYPTION_KEY/);
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'corto' }), /al menos 32/);
  });

  test('rechaza los secretos publicados en el repositorio', () => {
    assert.throws(() => loadConfig({ ...base, JWT_SECRET: 'f1_keyvault_jwt_session_signing_secret_super_long_32chars_minimum' }), /publicado/);
    assert.throws(() => loadConfig({ ...base, DEFAULT_ADMIN_EMAIL: 'a@b.cl', DEFAULT_ADMIN_PASSWORD: 'AdminFortress2026!' }), /DEFAULT_ADMIN_PASSWORD/);
  });

  test('el SSL de la BD valida el certificado por defecto (A-10)', () => {
    const cfg = loadConfig({ ...base, DATABASE_URL: 'postgresql://u:p@db.example.com:5432/db' });
    assert.deepEqual(cfg.databaseSsl, { rejectUnauthorized: true, ca: undefined });
  });

  test('las migraciones son idempotentes', async () => {
    assert.deepEqual(await runMigrations(ctx.db), []);
  });

  test('marca para cambio obligatorio a quien usa la clave publicada', async () => {
    const legacyHash = await new Promise<string>((resolve) => {
      import('node:crypto').then((c) => {
        const salt = c.randomBytes(16).toString('hex');
        c.scrypt('AdminFortress2026!', salt, 64, (_e, k) => resolve(`${salt}:${k.toString('hex')}`));
      });
    });
    await ctx.db.query(`INSERT INTO users (email, name, password_hash, role) VALUES ('legado@f1.services', 'Legado', $1, 'admin')`, [legacyHash]);
    await bootstrapUsers(ctx.db, loadConfig(base));
    const [row] = await ctx.db.query<{ must_change_password: boolean }>(`SELECT must_change_password FROM users WHERE email = 'legado@f1.services'`);
    assert.equal(row.must_change_password, true);
  });
});

describe('Autenticación y sesiones (A-01, A-06, A-07)', () => {
  test('mismo mensaje para cuenta inexistente y contraseña errónea; sin token en el cuerpo', async () => {
    await createUser('ana@f1.services');
    const c = new Client(ctx.baseUrl);
    const unknown = await c.post('/api/auth/login', { email: 'nadie@f1.services', password: 'x' });
    const wrong = await c.post('/api/auth/login', { email: 'ana@f1.services', password: 'x' });
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(unknown.data.message, wrong.data.message);
    const ok = await c.post('/api/auth/login', { email: 'ana@f1.services', password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.token, undefined);
  });

  test('bloquea la cuenta tras 10 intentos fallidos', async () => {
    await createUser('bruno@f1.services');
    for (let i = 0; i < 10; i++) {
      const attacker = new Client(ctx.baseUrl); // IP distinta cada vez: el bloqueo es por cuenta
      await attacker.post('/api/auth/login', { email: 'bruno@f1.services', password: `mala-${i}` });
    }
    const res = await new Client(ctx.baseUrl).post('/api/auth/login', { email: 'bruno@f1.services', password: PASSWORD });
    assert.equal(res.status, 401);
  });

  test('exige la cabecera CSRF y rechaza orígenes ajenos', async () => {
    const c = new Client(ctx.baseUrl);
    const noHeader = await c.request('POST', '/api/auth/login', { email: 'a', password: 'b' }, { 'x-f1-vault': '' });
    assert.equal(noHeader.status, 403);
    const foreign = await c.request('POST', '/api/auth/login', { email: 'a', password: 'b' }, { origin: 'https://evil.example' });
    assert.equal(foreign.status, 403);
  });

  test('logout revoca el token en el servidor', async () => {
    await createUser('carla@f1.services');
    const c = await login('carla@f1.services');
    const stolen = new Map(c.cookies);
    await c.post('/api/auth/logout');
    const thief = new Client(ctx.baseUrl);
    thief.cookies = stolen;
    assert.equal((await thief.get('/api/auth/me')).status, 401);
  });

  test('una cuenta deshabilitada pierde el acceso de inmediato', async () => {
    const id = await createUser('dario@f1.services');
    const c = await login('dario@f1.services');
    await ctx.db.query(`UPDATE users SET status = 'disabled' WHERE id = $1`, [id]);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  test('con cambio obligatorio solo puede cambiar la contraseña', async () => {
    await createUser('elena@f1.services', { mustChange: true });
    const c = await login('elena@f1.services');
    assert.equal((await c.get('/api/vault/status')).data.error, 'PASSWORD_CHANGE_REQUIRED');
    const res = await c.post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: 'Nueva-clave-segura-2026' });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal((await c.get('/api/vault/status')).status, 200);
  });
});

describe('PIN personal y bóveda (C-01, C-02, A-02, A-03)', () => {
  test('rechaza PIN débil y crea el PIN con la contraseña', async () => {
    await createUser('fabian@f1.services');
    const c = await login('fabian@f1.services');
    assert.equal((await c.post('/api/vault/pin/setup', { password: PASSWORD, newPin: '123456' })).status, 400);
    assert.equal((await c.post('/api/vault/pin/setup', { password: 'mala', newPin: PIN })).status, 400);
    const ok = await c.post('/api/vault/pin/setup', { password: PASSWORD, newPin: PIN });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal((await c.get('/api/vault/status')).data.unlocked, true);
  });

  test('intentos en paralelo no se saltan el límite de 5', async () => {
    await createUser('gabriela@f1.services', { pin: PIN });
    const c = await login('gabriela@f1.services');
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => c.post('/api/vault/unlock', { pin: String(100000 + i * 7919).slice(0, 6) })));
    const wrongPin = results.filter((r) => r.status === 400).length;
    assert.ok(wrongPin <= 4, `se evaluaron ${wrongPin} PIN incorrectos antes del bloqueo`);
    const [row] = await ctx.db.query<{ pin_failed_attempts: number; pin_locked_until: string | null }>(
      `SELECT pin_failed_attempts, pin_locked_until FROM users WHERE email = 'gabriela@f1.services'`
    );
    assert.equal(row.pin_failed_attempts, 5);
    assert.ok(row.pin_locked_until);
    // Bloqueado: ni el PIN correcto abre
    assert.equal((await c.post('/api/vault/unlock', { pin: PIN })).status, 429);
  });

  test('el bloqueo de un usuario no afecta a los demás', async () => {
    await createUser('hector@f1.services', { pin: PIN });
    await loginUnlocked('hector@f1.services');
  });

  test('change-pin exige bóveda desbloqueada y cuenta los intentos', async () => {
    await createUser('ines@f1.services', { pin: PIN });
    const locked = await login('ines@f1.services');
    assert.equal((await locked.post('/api/vault/change-pin', { currentPin: '000001', newPin: '739184' })).status, 403);

    const c = await loginUnlocked('ines@f1.services');
    for (let i = 0; i < 4; i++) {
      assert.equal((await c.post('/api/vault/change-pin', { currentPin: `90000${i}`, newPin: '739184' })).status, 400);
    }
    assert.equal((await c.post('/api/vault/change-pin', { currentPin: '900009', newPin: '739184' })).status, 429);
  });

  test('el token de bóveda no sirve con la sesión de otro usuario', async () => {
    await createUser('jose@f1.services', { pin: PIN });
    await createUser('karen@f1.services', { pin: PIN });
    const jose = await loginUnlocked('jose@f1.services');
    const karen = await login('karen@f1.services');
    karen.cookies.set('f1v_vault', jose.cookies.get('f1v_vault')!);
    assert.equal((await karen.get('/api/vault/passwords')).status, 403);
  });

  test('bloquear la bóveda invalida el token en el servidor', async () => {
    await createUser('luis@f1.services', { pin: PIN });
    const c = await loginUnlocked('luis@f1.services');
    const copy = c.cookies.get('f1v_vault')!;
    await c.post('/api/vault/lock');
    c.cookies.set('f1v_vault', copy);
    assert.equal((await c.get('/api/vault/passwords')).status, 403);
  });
});

describe('Secretos (A-04, A-05, M-04, M-05)', () => {
  let admin: Client;
  let op: Client;

  before(async () => {
    await createUser('admin1@f1.services', { role: 'admin', pin: PIN });
    await createUser('oper1@f1.services', { pin: PIN, envs: ['DEV', 'QA'] });
    admin = await loginUnlocked('admin1@f1.services');
    op = await loginUnlocked('oper1@f1.services');
  });

  test('el listado no trae secretos y revelar queda en la bitácora', async () => {
    const created = await op.post('/api/vault/passwords', { title: 'Portal X', password: 'S3creta!', notes: 'nota privada', additionalFields: [{ id: 'a', key: 'RUT', value: '1-9', isSecret: false }] });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const list = await op.get('/api/vault/passwords');
    const item = list.data.items.find((i: any) => i.id === created.data.id);
    assert.equal(item.password, undefined);
    assert.equal(item.notes, undefined);
    assert.equal(item.hasNotes, true);

    const reveal = await op.get(`/api/vault/passwords/${item.id}/reveal?purpose=COPY`);
    assert.equal(reveal.data.password, 'S3creta!');
    assert.equal(reveal.data.notes, 'nota privada');
    const [log] = await ctx.db.query<{ event_type: string }>(`SELECT event_type FROM vault_audit_logs WHERE target_id = $1 ORDER BY created_at DESC LIMIT 1`, [item.id]);
    assert.equal(log.event_type, 'COPY_PASSWORD');
  });

  test('editar exige la versión, conserva campos omitidos y guarda el historial', async () => {
    const { data } = await op.post('/api/vault/keys', { title: 'API dev', secret: 'old-secret', environment: 'DEV', additionalData: { region: 'cl' } });
    const meta = (await op.get('/api/vault/keys')).data.items.find((i: any) => i.id === data.id);

    const stale = await op.put(`/api/vault/keys/${data.id}`, { title: 'API dev', environment: 'DEV', version: meta.version + 5 });
    assert.equal(stale.status, 409);

    const ok = await op.put(`/api/vault/keys/${data.id}`, { title: 'API dev 2', environment: 'DEV', secret: 'new-secret', version: meta.version });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const reveal = await op.get(`/api/vault/keys/${data.id}/reveal`);
    assert.equal(reveal.data.secret, 'new-secret');
    assert.deepEqual(reveal.data.additionalData, { region: 'cl' });

    const versions = await admin.get(`/api/vault/keys/${data.id}/versions`);
    assert.equal(versions.data.items.length, 1);
    const old = await admin.get(`/api/vault/keys/versions/${versions.data.items[0].id}/reveal`);
    assert.equal(old.data.value, 'old-secret');
  });

  test('el operador solo ve llaves de sus entornos', async () => {
    const prod = await admin.post('/api/vault/keys', { title: 'Prod DB', secret: 'p', environment: 'PROD' });
    const list = await op.get('/api/vault/keys');
    assert.ok(!list.data.items.some((i: any) => i.id === prod.data.id));
    assert.equal((await op.get(`/api/vault/keys/${prod.data.id}/reveal`)).status, 404);
    assert.equal((await op.post('/api/vault/keys', { title: 'x', secret: 'y', environment: 'PROD' })).status, 403);
  });

  test('eliminar va a la papelera; restaurar y purgar son de admin', async () => {
    const { data } = await op.post('/api/vault/passwords', { title: 'Temporal', password: 'x' });
    assert.equal((await op.del(`/api/vault/passwords/${data.id}`)).status, 200);
    assert.equal((await op.get('/api/vault/passwords/trash')).status, 403);
    assert.ok((await admin.get('/api/vault/passwords/trash')).data.items.some((i: any) => i.id === data.id));
    assert.equal((await admin.post(`/api/vault/passwords/${data.id}/restore`)).status, 200);
    await op.del(`/api/vault/passwords/${data.id}`);
    assert.equal((await admin.del(`/api/vault/passwords/${data.id}/purge`)).status, 200);
  });

  test('valida entradas: id no UUID y campos con tipo incorrecto responden 400', async () => {
    assert.equal((await op.get('/api/vault/passwords/no-es-uuid/reveal')).status, 400);
    assert.equal((await op.post('/api/vault/passwords', { title: 'x', password: 'y', category: 123 })).status, 400);
    assert.equal((await op.post('/api/vault/keys', { title: 'x', secret: 'y', expiresAt: '2026-99-99' })).status, 400);
    assert.equal((await op.post('/api/vault/passwords', { title: 'x', password: 'y', url: 'javascript:alert(1)' })).status, 400);
  });

  test('un cifrado copiado a otro registro no se puede abrir (AAD)', async () => {
    const a = await op.post('/api/vault/passwords', { title: 'A', password: 'secreto-A' });
    const b = await op.post('/api/vault/passwords', { title: 'B', password: 'secreto-B' });
    await ctx.db.query(
      `UPDATE vault_passwords SET encrypted_password = (SELECT encrypted_password FROM vault_passwords WHERE id = $1) WHERE id = $2`,
      [a.data.id, b.data.id]
    );
    assert.equal((await op.get(`/api/vault/passwords/${b.data.id}/reveal`)).status, 500);
  });
});

describe('Bitácora y segregación de funciones (A-08, A-09)', () => {
  test('la bitácora rechaza UPDATE y DELETE', async () => {
    await assert.rejects(ctx.db.query(`UPDATE vault_audit_logs SET event_type = 'X'`), /inmutable/);
    await assert.rejects(ctx.db.query(`DELETE FROM vault_audit_logs`), /inmutable/);
  });

  test('el operador solo ve sus eventos', async () => {
    const op = await loginUnlocked('oper1@f1.services');
    const res = await op.get('/api/vault/audit?limit=100');
    assert.equal(res.data.scope, 'own');
    assert.ok(res.data.items.every((e: any) => e.user_email === 'oper1@f1.services'));
  });

  test('otorgar admin requiere a otro admin; nadie se aprueba a sí mismo', async () => {
    await createUser('admin2@f1.services', { role: 'admin', pin: PIN });
    const target = await createUser('candidato@f1.services');
    const a1 = await loginUnlocked('admin1@f1.services');
    const a2 = await loginUnlocked('admin2@f1.services');

    const req = await a1.post(`/api/users/${target}/admin-request`);
    assert.equal(req.status, 202, JSON.stringify(req.data));
    const pending = (await a1.get('/api/users/admin-requests')).data.items.find((r: any) => r.targetUserId === target && r.status === 'pending');
    assert.equal((await a1.post(`/api/users/admin-requests/${pending.id}/approve`)).status, 403);
    assert.equal((await a2.post(`/api/users/admin-requests/${pending.id}/approve`)).status, 200);
    const [row] = await ctx.db.query<{ role: string }>('SELECT role FROM users WHERE id = $1', [target]);
    assert.equal(row.role, 'admin');
  });

  test('el admin no puede resetearse a sí mismo ni operar sin bóveda', async () => {
    const a1 = await loginUnlocked('admin1@f1.services');
    const me = (await a1.get('/api/auth/me')).data.user.id;
    assert.equal((await a1.post(`/api/users/${me}/reset-password`, { temporaryPassword: 'Temporal-segura-2026' })).status, 400);
    assert.equal((await a1.post(`/api/users/${me}/reset-pin`)).status, 400);
    const noVault = await login('admin1@f1.services');
    assert.equal((await noVault.get('/api/users')).status, 403);
  });

  test('crear usuario: contraseña temporal con política y siempre como operador', async () => {
    const a1 = await loginUnlocked('admin1@f1.services');
    assert.equal((await a1.post('/api/users', { email: 'nuevo@f1.services', name: 'Nuevo', temporaryPassword: 'corta' })).status, 400);
    const ok = await a1.post('/api/users', { email: 'nuevo@f1.services', name: 'Nuevo', temporaryPassword: 'Temporal-segura-2026', role: 'admin' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal((await a1.post('/api/users', { email: 'nuevo@f1.services', name: 'Nuevo', temporaryPassword: 'Temporal-segura-2026' })).status, 409);
    const [row] = await ctx.db.query<{ role: string; must_change_password: boolean }>(`SELECT role, must_change_password FROM users WHERE email = 'nuevo@f1.services'`);
    assert.deepEqual(row, { role: 'operator', must_change_password: true });
  });
});
