import crypto from 'node:crypto';

/**
 * Cifrado y firmas de la bóveda.
 *
 * - v2 (actual): AES-256-GCM con la clave maestra derivada UNA sola vez al arrancar (A-05) y datos
 *   asociados (AAD) que atan cada valor a su tabla, registro y campo: un cifrado copiado a otro registro no abre.
 *   Formato: "v2:<kid>:<iv>:<tag>:<ciphertext>" (base64url). `kid` identifica la clave para poder rotarla (M-09).
 * - v1 (legado, solo lectura): sal por registro y scrypt por cada operación. Se re-cifra a v2 al arrancar.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MASTER_SALT = 'f1-keyvault/v2/master-key';

/** Parámetros scrypt para contraseñas y PIN (OWASP: N=2^15, r=8, p=3 ≈ 32 MB). */
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, keylen: 64, maxmem: 96 * 1024 * 1024 };

interface MasterKey { kid: string; key: Buffer; secret: string }

interface CryptoState {
  current: MasterKey;
  previous?: MasterKey;
  jwtKey: Buffer;
  vaultTokenKey: Buffer;
  pinPepper: Buffer;
  legacyKeys: Map<string, Buffer>;
}

let state: CryptoState | null = null;

function deriveMaster(secret: string): MasterKey {
  const key = crypto.scryptSync(secret, MASTER_SALT, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const kid = crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
  return { kid, key, secret };
}

function hkdf(secret: string | Buffer, info: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'f1-keyvault', info, 32));
}

/** Deriva todas las claves una sola vez. Debe llamarse antes de usar cualquier otra función. */
export function initCrypto(options: { masterKey: string; previousMasterKey?: string; jwtSecret: string }): void {
  const current = deriveMaster(options.masterKey);
  state = {
    current,
    previous: options.previousMasterKey ? deriveMaster(options.previousMasterKey) : undefined,
    // Claves separadas por propósito (A-02): sesión, token de bóveda y pimienta del PIN.
    jwtKey: hkdf(options.jwtSecret, 'session-jwt'),
    vaultTokenKey: hkdf(options.jwtSecret, 'vault-token'),
    pinPepper: hkdf(current.key, 'pin-pepper'),
    legacyKeys: new Map(),
  };
}

function s(): CryptoState {
  if (!state) throw new Error('El servicio criptográfico no fue inicializado.');
  return state;
}

export const currentKeyId = (): string => s().current.kid;
export const jwtSigningKey = (): Buffer => s().jwtKey;

const b64 = (buf: Buffer) => buf.toString('base64url');
const unb64 = (txt: string) => Buffer.from(txt, 'base64url');

/** Contexto que se ata al cifrado: tabla, id de registro y campo. */
export const aad = (table: string, id: string, field: string): string => `${table}:${id}:${field}`;

export function encryptValue(plainText: string, context: string): string {
  if (typeof plainText !== 'string' || plainText.length === 0) return '';
  const { current } = s();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, current.key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return ['v2', current.kid, b64(iv), b64(cipher.getAuthTag()), b64(encrypted)].join(':');
}

function legacyKey(secret: string, saltHex: string): Buffer {
  const cache = s().legacyKeys;
  const id = `${secret.length}:${crypto.createHash('sha256').update(secret).digest('hex').slice(0, 8)}:${saltHex}`;
  let key = cache.get(id);
  if (!key) {
    key = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), 32);
    if (cache.size > 2000) cache.clear();
    cache.set(id, key);
  }
  return key;
}

function decryptLegacy(parts: string[]): string {
  const [, saltHex, ivHex, tagHex, encryptedHex] = parts;
  const candidates = [s().current, s().previous].filter(Boolean) as MasterKey[];
  let lastError: unknown;
  for (const master of candidates) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, legacyKey(master.secret, saltHex), Buffer.from(ivHex, 'hex'), {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo descifrar el valor heredado.');
}

export function decryptValue(payload: string | null | undefined, context: string): string {
  if (!payload) return '';
  const parts = payload.split(':');
  if (parts[0] === 'v1' && parts.length === 5) return decryptLegacy(parts);
  if (parts[0] !== 'v2' || parts.length !== 5) throw new Error('Formato de carga cifrada no válido o versión desconocida.');

  const [, kid, ivTxt, tagTxt, dataTxt] = parts;
  const { current, previous } = s();
  const master = kid === current.kid ? current : previous && kid === previous.kid ? previous : null;
  if (!master) throw new Error('El valor fue cifrado con una clave maestra desconocida.');

  const decipher = crypto.createDecipheriv(ALGORITHM, master.key, unb64(ivTxt), { authTagLength: TAG_LENGTH });
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(unb64(tagTxt));
  return Buffer.concat([decipher.update(unb64(dataTxt)), decipher.final()]).toString('utf8');
}

/** true si el valor debe re-cifrarse (formato v1 o clave anterior). */
export const needsReencryption = (payload: string | null | undefined): boolean =>
  Boolean(payload) && !payload!.startsWith(`v2:${s().current.kid}:`);

// ── Contraseñas y PIN ────────────────────────────────────────────────────────

function scryptAsync(secret: string | Buffer, salt: Buffer | string, keylen: number, opts: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashSecret(secret: string | Buffer): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(secret, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(key)}`;
}

async function verifySecret(secret: string | Buffer, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  try {
    if (stored.startsWith('scrypt$')) {
      const [, n, r, p, saltTxt, keyTxt] = stored.split('$');
      const expected = unb64(keyTxt);
      const opts = { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem };
      const actual = await scryptAsync(secret, unb64(saltTxt), expected.length, opts);
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    }
    // Formato heredado "<sal_hex>:<hash_hex>" (scrypt por defecto, 64 bytes).
    const [salt, keyHex] = stored.split(':');
    if (!salt || !keyHex) return false;
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scryptAsync(secret, salt, expected.length, {});
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const hashPassword = (password: string) => hashSecret(password);
export const verifyPassword = (password: string, stored: string | null | undefined) => verifySecret(password, stored);
export const isLegacyPasswordHash = (stored: string) => !stored.startsWith('scrypt$');

let dummyHash: Promise<string> | null = null;
/** Verificación contra un hash ficticio: iguala el tiempo de respuesta cuando el usuario no existe (A-06). */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashSecret(crypto.randomBytes(16).toString('hex'));
  await verifySecret(password, await dummyHash);
  return false;
}

/** El PIN se mezcla con una pimienta derivada de la clave maestra: un volcado de BD no basta para probarlos. */
const pepperPin = (pin: string) => crypto.createHmac('sha256', s().pinPepper).update(pin, 'utf8').digest();
export const hashPin = (pin: string) => hashSecret(pepperPin(pin));
export const verifyPin = (pin: string, stored: string | null | undefined) => verifySecret(pepperPin(pin), stored);

/** PIN personal: 6 dígitos y sin patrones triviales. Devuelve el motivo del rechazo o null. */
export function pinWeakness(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'El PIN debe tener exactamente 6 dígitos.';
  if (/^(\d)\1{5}$/.test(pin)) return 'El PIN no puede repetir el mismo dígito.';
  const digits = pin.split('').map(Number);
  const asc = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const desc = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (asc || desc) return 'El PIN no puede ser una secuencia (123456, 654321…).';
  if (/^(\d{2})\1\1$/.test(pin) || /^(\d{3})\1$/.test(pin)) return 'El PIN no puede repetir un patrón corto (121212, 123123…).';
  return null;
}

// ── Token de bóveda (HMAC) ───────────────────────────────────────────────────

export interface VaultTokenPayload {
  uid: string;
  /** Versión de sesión del usuario: si cambia (logout, cambio de clave), el token deja de valer. */
  sv: number;
  /** Época de bóveda: al bloquear o cambiar el PIN se incrementa y el token deja de valer (A-02). */
  ve: number;
  iat: number;
  exp: number;
  /** Límite absoluto desde el desbloqueo, aunque haya actividad. */
  abs: number;
}

export const VAULT_IDLE_SECONDS = 15 * 60;
export const VAULT_ABSOLUTE_SECONDS = 2 * 60 * 60;

export function createVaultToken(input: { uid: string; sv: number; ve: number; abs?: number }): { token: string; payload: VaultTokenPayload } {
  const now = Date.now();
  const abs = input.abs ?? now + VAULT_ABSOLUTE_SECONDS * 1000;
  const payload: VaultTokenPayload = { uid: input.uid, sv: input.sv, ve: input.ve, iat: now, exp: Math.min(now + VAULT_IDLE_SECONDS * 1000, abs), abs };
  const body = b64(Buffer.from(JSON.stringify(payload)));
  const sig = b64(crypto.createHmac('sha256', s().vaultTokenKey).update(body).digest());
  return { token: `${body}.${sig}`, payload };
}

export function verifyVaultToken(token: string | undefined | null): VaultTokenPayload | null {
  if (!token || typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', s().vaultTokenKey).update(body).digest();
  const given = unb64(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(unb64(body).toString('utf8')) as VaultTokenPayload;
    const now = Date.now();
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number' || now > payload.exp || now > payload.abs) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Valores aleatorios con CSPRNG. */
export const randomId = () => crypto.randomUUID();
