import crypto from 'node:crypto';

// Algoritmo militar de cifrado autenticado
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recomendado para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SCRYPT_SALT_LENGTH = 16;

/**
 * Obtiene la clave de cifrado simétrica derivada de 32 bytes (256 bits).
 */
function getDerivedMasterKey(salt: Buffer): Buffer {
  const masterSecret = process.env.MASTER_ENCRYPTION_KEY || 'f1_fortress_default_master_encryption_key_2026';
  return crypto.scryptSync(masterSecret, salt, 32);
}

/**
 * Cifra cualquier texto plano usando AES-256-GCM con clave derivada por scrypt.
 * Formato de salida: "v1:<salt_hex>:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 */
export function encryptValue(plainText: string): string {
  if (typeof plainText !== 'string' || plainText.length === 0) {
    return '';
  }

  const salt = crypto.randomBytes(SCRYPT_SALT_LENGTH);
  const key = getDerivedMasterKey(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Descifra un valor cifrado en formato "v1:<salt>:<iv>:<tag>:<ciphertext>".
 * Si fue manipulado o la clave es incorrecta, lanza excepción.
 */
export function decryptValue(payload: string): string {
  if (!payload || typeof payload !== 'string') {
    return '';
  }

  const parts = payload.split(':');
  if (parts.length !== 5 || parts[0] !== 'v1') {
    throw new Error('Formato de carga cifrada no válido o versión desconocida.');
  }

  const [, saltHex, ivHex, tagHex, encryptedHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const key = getDerivedMasterKey(salt);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Genera sal criptográfica aleatoria en hexadecimal.
 */
export function generateSalt(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hashea una contraseña de usuario con scrypt y sal aleatoria.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Compara una contraseña con su hash scrypt en tiempo constante.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return resolve(false);
      const keyBuffer = Buffer.from(keyHex, 'hex');
      if (keyBuffer.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
    });
  });
}

/**
 * Hashea un PIN de 4 dígitos con scrypt.
 */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, 32, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

/**
 * Verifica un PIN de 4 dígitos en tiempo constante.
 */
export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const actualHash = await hashPin(pin, salt);
  const actualBuffer = Buffer.from(actualHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Genera un token efímero de sesión de bóveda firmado con HMAC-SHA256.
 * Caducidad por defecto: 15 minutos (900 segundos).
 */
export function createVaultSessionToken(userId: string, userEmail: string, expiresInSeconds = 900): string {
  const secret = process.env.JWT_SECRET || 'f1_keyvault_session_secret_2026';
  const expiresAt = Date.now() + expiresInSeconds * 1000;
  const payload = JSON.stringify({ uid: userId, email: userEmail, exp: expiresAt, nonce: crypto.randomBytes(8).toString('hex') });
  const payloadBase64 = Buffer.from(payload).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

/**
 * Verifica un token de sesión de bóveda firmado.
 */
export function verifyVaultSessionToken(token: string): { valid: boolean; email?: string; userId?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };

  const [payloadBase64, signature] = parts;
  const secret = process.env.JWT_SECRET || 'f1_keyvault_session_secret_2026';
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) {
      return { valid: false };
    }
    return { valid: true, email: payload.email, userId: payload.uid };
  } catch {
    return { valid: false };
  }
}

