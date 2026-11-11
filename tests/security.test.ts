import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptValue,
  decryptValue,
  hashPassword,
  verifyPassword,
  hashPin,
  verifyPin,
  generateSalt,
  createVaultSessionToken,
  verifyVaultSessionToken,
} from '../server/services/cryptoService.js';

test('Cifrado y Descifrado AES-256-GCM', () => {
  const originalSecret = 'SuperSecretToken_12345!@#$%^&*()';
  const encrypted = encryptValue(originalSecret);

  assert.ok(encrypted.startsWith('v1:'), 'El payload debe tener el prefijo de versión v1');
  assert.notEqual(encrypted, originalSecret, 'El texto cifrado no debe coincidir con el texto plano');

  const decrypted = decryptValue(encrypted);
  assert.equal(decrypted, originalSecret, 'El texto descifrado debe coincidir exactamente con el original');
});

test('Detección y rechazo de manipulación (AuthTag / Ciphertext tampering)', () => {
  const secret = 'ClaveBancariaUltraSegura2026';
  const encrypted = encryptValue(secret);
  const parts = encrypted.split(':');

  // Adulterar el ciphertext (última parte)
  const tamperedCiphertext = parts[4].slice(0, -2) + (parts[4].endsWith('0') ? '1' : '0');
  parts[4] = tamperedCiphertext;
  const tamperedPayload = parts.join(':');

  assert.throws(
    () => decryptValue(tamperedPayload),
    /unsupported state or unable to authenticate data/i,
    'Debe rechazar inmediatamente cualquier carga adulterada'
  );
});

test('Hash y Verificación de Contraseñas con scrypt', async () => {
  const password = 'PasswordPruebaF1_2026!';
  const hash = await hashPassword(password);

  assert.ok(hash.includes(':'), 'El hash debe contener la sal y el digest separado por dos puntos');

  const isValid = await verifyPassword(password, hash);
  assert.equal(isValid, true, 'La contraseña correcta debe ser validada exitosamente');

  const isInvalid = await verifyPassword('PasswordErronea', hash);
  assert.equal(isInvalid, false, 'Una contraseña incorrecta debe ser rechazada');
});

test('Hash y Verificación de PIN Maestro de 4 dígitos', async () => {
  const pin = '4829';
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);

  const isValid = await verifyPin(pin, salt, hash);
  assert.equal(isValid, true, 'El PIN correcto debe ser validado exitosamente');

  const isWrong = await verifyPin('1111', salt, hash);
  assert.equal(isWrong, false, 'Un PIN incorrecto debe ser rechazado');
});

test('Generación y Verificación de Token Efímero de Bóveda', () => {
  const token = createVaultSessionToken('usr-123', 'admin@f1.services', 900);
  assert.ok(token.includes('.'), 'El token debe tener payload y firma');

  const verification = verifyVaultSessionToken(token);
  assert.equal(verification.valid, true, 'El token generado debe ser válido');
  assert.equal(verification.email, 'admin@f1.services');
  assert.equal(verification.userId, 'usr-123');

  // Token adulterado
  const tamperedToken = token.slice(0, -2) + 'aa';
  const tamperedVerification = verifyVaultSessionToken(tamperedToken);
  assert.equal(tamperedVerification.valid, false, 'El token adulterado debe ser rechazado');
});
