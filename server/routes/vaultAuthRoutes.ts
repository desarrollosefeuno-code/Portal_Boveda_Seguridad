import { Router, type Request } from 'express';
import { query, transaction, type Queryable } from '../db/connection.js';
import { hashPin, pinWeakness, verifyPassword, verifyPin } from '../services/cryptoService.js';
import { auditBestEffort, auditStrict } from '../services/auditService.js';
import { requireAuth, VAULT_COOKIE, type AuthenticatedUser } from '../middleware/auth.js';
import { currentVaultSession, requireVaultUnlocked, setVaultCookie } from '../middleware/vaultAuth.js';
import { rateLimit } from '../middleware/security.js';
import { handler, HttpError, parse, pinChangeSchema, pinSetupSchema, pinUnlockSchema } from '../validation.js';

/**
 * PIN personal de 6 dígitos (A-03): cada usuario tiene el suyo y su propio bloqueo por intentos.
 * El contador se actualiza dentro de una transacción con la fila bloqueada (C-02): peticiones en paralelo
 * se atienden de a una y no pueden saltarse el límite.
 */
const router = Router();
router.use(requireAuth);

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 15;

const pinLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, key: (req) => `pin:${req.user?.id}` });

interface PinRow {
  pin_hash: string | null;
  pin_failed_attempts: number;
  pin_locked_until: string | null;
  vault_epoch: number;
}

const lockedUntil = (row: PinRow): number => (row.pin_locked_until ? new Date(row.pin_locked_until).getTime() : 0);

/**
 * Verifica el PIN con la fila del usuario bloqueada. Registra el fallo o reinicia el contador.
 * Lanza 429 si está bloqueado y 400 si el PIN no coincide.
 */
async function checkPinLocked(tx: Queryable, req: Request, user: AuthenticatedUser, pin: string, action: string): Promise<PinRow> {
  const [row] = await tx.query<PinRow>(
    'SELECT pin_hash, pin_failed_attempts, pin_locked_until, vault_epoch FROM users WHERE id = $1 FOR UPDATE',
    [user.id]
  );
  if (!row?.pin_hash) throw new HttpError(409, 'PIN_NOT_SET', 'Aún no has definido tu PIN personal.');

  const until = lockedUntil(row);
  if (until > Date.now()) {
    throw new HttpError(429, 'VAULT_LOCKOUT', 'Tu bóveda está bloqueada temporalmente por intentos fallidos.', {
      lockedUntil: new Date(until).toISOString(),
    });
  }
  const previousFailures = until && until <= Date.now() ? 0 : row.pin_failed_attempts;

  if (await verifyPin(pin, row.pin_hash)) {
    await tx.query('UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1', [user.id]);
    return row;
  }

  const attempts = previousFailures + 1;
  const locks = attempts >= PIN_MAX_ATTEMPTS;
  const lockAt = locks ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString() : null;
  await tx.query('UPDATE users SET pin_failed_attempts = $2, pin_locked_until = $3 WHERE id = $1', [user.id, attempts, lockAt]);
  await auditStrict(
    {
      eventType: locks ? 'LOCKOUT_TRIGGERED' : 'UNLOCK_VAULT_FAILED',
      targetType: 'VAULT',
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      req,
      details: { action, attempt: attempts, remaining: Math.max(0, PIN_MAX_ATTEMPTS - attempts) },
    },
    tx
  );
  // Se marca para confirmar la transacción (registrar el intento) y luego responder con el error.
  throw Object.assign(
    locks
      ? new HttpError(429, 'VAULT_LOCKOUT', `Superaste ${PIN_MAX_ATTEMPTS} intentos. Tu bóveda queda bloqueada ${PIN_LOCK_MINUTES} minutos.`, { lockedUntil: lockAt })
      : new HttpError(400, 'INVALID_VAULT_PIN', `PIN incorrecto. Te quedan ${PIN_MAX_ATTEMPTS - attempts} intento(s).`, {
          remainingAttempts: PIN_MAX_ATTEMPTS - attempts,
        }),
    { commit: true }
  );
}

/** Ejecuta en transacción, pero confirma los cambios aunque se lance un error marcado con `commit`. */
async function txKeepingFailures<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  let pending: unknown = null;
  const result = await transaction(async (tx) => {
    try {
      return await fn(tx);
    } catch (err) {
      if ((err as { commit?: boolean }).commit) {
        pending = err;
        return undefined as T;
      }
      throw err;
    }
  });
  if (pending) throw pending;
  return result;
}

// GET /api/vault/status
router.get(
  '/status',
  handler(async (req, res) => {
    const user = req.user!;
    const [row] = await query<PinRow>('SELECT pin_hash, pin_failed_attempts, pin_locked_until, vault_epoch FROM users WHERE id = $1', [user.id]);
    const until = lockedUntil(row);
    const lockedOut = until > Date.now();
    const failures = until && !lockedOut ? 0 : row.pin_failed_attempts;
    const session = currentVaultSession(req);
    res.json({
      hasPin: Boolean(row.pin_hash),
      unlocked: Boolean(session),
      expiresAt: session ? new Date(session.exp).toISOString() : null,
      isLockedOut: lockedOut,
      lockedUntil: lockedOut ? new Date(until).toISOString() : null,
      remainingAttempts: Math.max(0, PIN_MAX_ATTEMPTS - failures),
      maxAttempts: PIN_MAX_ATTEMPTS,
    });
  })
);

// POST /api/vault/pin/setup — primer PIN (o tras un reseteo del admin). Exige la contraseña de la cuenta.
router.post(
  '/pin/setup',
  pinLimiter,
  handler(async (req, res) => {
    const { password, newPin } = parse(pinSetupSchema, req.body);
    const user = req.user!;
    const weak = pinWeakness(newPin);
    if (weak) throw new HttpError(400, 'WEAK_PIN', weak);

    const [row] = await query<{ password_hash: string; pin_hash: string | null }>('SELECT password_hash, pin_hash FROM users WHERE id = $1', [user.id]);
    if (row.pin_hash) throw new HttpError(409, 'PIN_ALREADY_SET', 'Ya tienes un PIN. Usa "Cambiar PIN" desde la bóveda desbloqueada.');
    if (!(await verifyPassword(password, row.password_hash))) {
      await auditBestEffort({ eventType: 'PIN_SETUP_FAILED', targetType: 'VAULT', userId: user.id, userEmail: user.email, userName: user.name, req });
      throw new HttpError(400, 'INVALID_PASSWORD', 'La contraseña de tu cuenta no es correcta.');
    }

    const hash = await hashPin(newPin);
    const epoch = await transaction(async (tx) => {
      const [updated] = await tx.query<{ vault_epoch: number }>(
        `UPDATE users SET pin_hash = $1, pin_set_at = NOW(), pin_failed_attempts = 0, pin_locked_until = NULL,
           vault_epoch = vault_epoch + 1 WHERE id = $2 AND pin_hash IS NULL RETURNING vault_epoch`,
        [hash, user.id]
      );
      if (!updated) throw new HttpError(409, 'PIN_ALREADY_SET', 'Ya tienes un PIN.');
      await auditStrict({ eventType: 'SETUP_PIN', targetType: 'VAULT', userId: user.id, userEmail: user.email, userName: user.name, req }, tx);
      return updated.vault_epoch;
    });

    const session = setVaultCookie(res, { ...user, vaultEpoch: epoch, hasPin: true });
    res.json({ success: true, expiresAt: new Date(session.exp).toISOString(), message: 'PIN personal creado. Bóveda desbloqueada.' });
  })
);

// POST /api/vault/unlock
router.post(
  '/unlock',
  pinLimiter,
  handler(async (req, res) => {
    const { pin } = parse(pinUnlockSchema, req.body);
    const user = req.user!;
    const row = await txKeepingFailures(async (tx) => {
      const r = await checkPinLocked(tx, req, user, pin, 'unlock');
      await auditStrict({ eventType: 'UNLOCK_VAULT_SUCCESS', targetType: 'VAULT', userId: user.id, userEmail: user.email, userName: user.name, req }, tx);
      return r;
    });
    const session = setVaultCookie(res, { ...user, vaultEpoch: row.vault_epoch });
    res.json({ success: true, expiresAt: new Date(session.exp).toISOString(), message: 'Bóveda desbloqueada.' });
  })
);

// POST /api/vault/lock — invalida el token en el servidor, no solo en el navegador (A-02)
router.post(
  '/lock',
  handler(async (req, res) => {
    const user = req.user!;
    await query('UPDATE users SET vault_epoch = vault_epoch + 1 WHERE id = $1', [user.id]);
    res.clearCookie(VAULT_COOKIE, { path: '/api' });
    await auditBestEffort({ eventType: 'LOCK_VAULT', targetType: 'VAULT', userId: user.id, userEmail: user.email, userName: user.name, req });
    res.json({ success: true });
  })
);

// POST /api/vault/change-pin — exige bóveda desbloqueada y el PIN actual con el mismo contador de intentos (C-01)
router.post(
  '/change-pin',
  requireVaultUnlocked,
  pinLimiter,
  handler(async (req, res) => {
    const { currentPin, newPin } = parse(pinChangeSchema, req.body);
    const user = req.user!;
    const weak = pinWeakness(newPin);
    if (weak) throw new HttpError(400, 'WEAK_PIN', weak);
    if (newPin === currentPin) throw new HttpError(400, 'SAME_PIN', 'El nuevo PIN debe ser distinto del actual.');

    const hash = await hashPin(newPin);
    const epoch = await txKeepingFailures(async (tx) => {
      await checkPinLocked(tx, req, user, currentPin, 'change-pin');
      const [updated] = await tx.query<{ vault_epoch: number }>(
        'UPDATE users SET pin_hash = $1, pin_set_at = NOW(), vault_epoch = vault_epoch + 1 WHERE id = $2 RETURNING vault_epoch',
        [hash, user.id]
      );
      await auditStrict({ eventType: 'CHANGE_PIN', targetType: 'VAULT', userId: user.id, userEmail: user.email, userName: user.name, req }, tx);
      return updated.vault_epoch;
    });

    const session = setVaultCookie(res, { ...user, vaultEpoch: epoch });
    res.json({ success: true, expiresAt: new Date(session.exp).toISOString(), message: 'PIN actualizado.' });
  })
);

export default router;
