import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  aad,
  createVaultToken,
  decryptValue,
  encryptValue,
  hashPassword,
  hashPin,
  initCrypto,
  needsReencryption,
  pinWeakness,
  verifyPassword,
  verifyPin,
  verifyVaultToken,
} from '../server/services/cryptoService.js';
import { TEST_SECRETS } from './helpers.js';

initCrypto(TEST_SECRETS);

test('AES-256-GCM v2: cifra, descifra y ata el valor a su registro', () => {
  const ctx = aad('vault_keys', '1', 'encrypted_secret');
  const enc = encryptValue('SuperSecretToken_12345!', ctx);
  assert.ok(enc.startsWith('v2:'));
  assert.equal(decryptValue(enc, ctx), 'SuperSecretToken_12345!');
  assert.throws(() => decryptValue(enc, aad('vault_keys', '2', 'encrypted_secret')));
});

test('rechaza un cifrado manipulado', () => {
  const ctx = aad('t', '1', 'f');
  const parts = encryptValue('ClaveUltraSegura', ctx).split(':');
  parts[4] = parts[4].slice(0, -2) + (parts[4].endsWith('A') ? 'B' : 'A');
  assert.throws(() => decryptValue(parts.join(':'), ctx));
});

test('lee el formato heredado v1 y lo marca para re-cifrar', () => {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(TEST_SECRETS.masterKey, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update('valor-antiguo', 'utf8'), cipher.final()]);
  const v1 = ['v1', salt.toString('hex'), iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
  assert.equal(decryptValue(v1, 'cualquiera'), 'valor-antiguo');
  assert.equal(needsReencryption(v1), true);
  assert.equal(needsReencryption(encryptValue('x', 'c')), false);
});

test('rota la clave maestra: lo cifrado con la anterior se sigue leyendo', () => {
  const ctx = aad('t', '9', 'f');
  const enc = encryptValue('antes-de-rotar', ctx);
  initCrypto({ masterKey: 'otra-clave-maestra-nueva-0123456789abcdef', previousMasterKey: TEST_SECRETS.masterKey, jwtSecret: TEST_SECRETS.jwtSecret });
  assert.equal(decryptValue(enc, ctx), 'antes-de-rotar');
  assert.equal(needsReencryption(enc), true);
  initCrypto(TEST_SECRETS);
});

test('contraseñas: hash scrypt nuevo y compatibilidad con el formato heredado', async () => {
  const hash = await hashPassword('PasswordPruebaF1_2026!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('PasswordPruebaF1_2026!', hash), true);
  assert.equal(await verifyPassword('otra', hash), false);

  const salt = crypto.randomBytes(16).toString('hex');
  const legacy = `${salt}:${crypto.scryptSync('heredada', salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword('heredada', legacy), true);
});

test('PIN personal: hash con pimienta y política de 6 dígitos', async () => {
  const hash = await hashPin('482915');
  assert.equal(await verifyPin('482915', hash), true);
  assert.equal(await verifyPin('482916', hash), false);
  for (const weak of ['111111', '123456', '987654', '121212', '123123', '1234']) assert.ok(pinWeakness(weak), weak);
  assert.equal(pinWeakness('482915'), null);
});

test('token de bóveda: firmado, con caducidad y rechazo de manipulación', () => {
  const { token, payload } = createVaultToken({ uid: 'u1', sv: 1, ve: 1 });
  assert.equal(verifyVaultToken(token)?.uid, 'u1');
  assert.ok(payload.exp <= payload.abs);
  assert.equal(verifyVaultToken(token.slice(0, -2) + 'aa'), null);
  const expired = createVaultToken({ uid: 'u1', sv: 1, ve: 1, abs: Date.now() - 1000 });
  assert.equal(verifyVaultToken(expired.token), null);
});
