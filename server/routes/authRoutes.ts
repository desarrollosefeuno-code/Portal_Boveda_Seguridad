import { Router } from 'express';
import { query, transaction } from '../db/connection.js';
import { hashPassword, isLegacyPasswordHash, verifyDummyPassword, verifyPassword } from '../services/cryptoService.js';
import { auditBestEffort, auditStrict, clientIp } from '../services/auditService.js';
import { clearSession, issueSession, requireAuth, type AuthenticatedUser } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { changePasswordSchema, handler, HttpError, loginSchema, parse, profileSchema } from '../validation.js';

const router = Router();

const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCK_MINUTES = 15;
const GENERIC_LOGIN_ERROR = 'Correo o contraseña incorrectos.';

/** Respuesta pública del usuario: nunca incluye hashes ni contadores. */
export const publicUser = (u: AuthenticatedUser) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  hasPin: u.hasPin,
  mustChangePassword: u.mustChangePassword,
  keyEnvironments: u.keyEnvironments,
});

const loginByIp = rateLimit({ windowMs: 15 * 60_000, max: 40, key: (req) => `login-ip:${clientIp(req)}` });
const loginByAccount = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `login-acct:${clientIp(req)}:${String(req.body?.email || '').toLowerCase().slice(0, 254)}`,
});

interface LoginRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  status: string;
  session_version: number;
  login_locked_until: string | null;
}

// POST /api/auth/login
router.post(
  '/login',
  loginByIp,
  loginByAccount,
  handler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const rows = await query<LoginRow>(
      `SELECT id, email, name, password_hash, status, session_version, login_locked_until FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];

    // Mismo trabajo y mismo mensaje exista o no la cuenta (A-06: sin enumeración de usuarios).
    if (!user) {
      await verifyDummyPassword(password);
      await auditBestEffort({ eventType: 'LOGIN_FAILED', targetType: 'AUTH', userEmail: email || 'desconocido', req, details: { reason: 'unknown_account' } });
      throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    const lockedUntil = user.login_locked_until ? new Date(user.login_locked_until).getTime() : 0;
    if (lockedUntil > Date.now()) {
      await verifyDummyPassword(password);
      await auditBestEffort({ eventType: 'LOGIN_BLOCKED', targetType: 'AUTH', userId: user.id, userEmail: user.email, req });
      throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid || user.status !== 'active') {
      // Contador atómico: una sola sentencia, sin leer y luego escribir (C-02).
      const [state] = await query<{ failed_login_attempts: number; login_locked_until: string | null }>(
        `UPDATE users SET
           failed_login_attempts = CASE WHEN login_locked_until IS NOT NULL AND login_locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END,
           login_locked_until = CASE
             WHEN (CASE WHEN login_locked_until IS NOT NULL AND login_locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END) >= $2
             THEN NOW() + ($3 || ' minutes')::interval ELSE NULL END
         WHERE id = $1
         RETURNING failed_login_attempts, login_locked_until`,
        [user.id, LOGIN_MAX_FAILURES, String(LOGIN_LOCK_MINUTES)]
      );
      await auditBestEffort({
        eventType: state?.login_locked_until ? 'LOGIN_LOCKOUT' : 'LOGIN_FAILED',
        targetType: 'AUTH',
        userId: user.id,
        userEmail: user.email,
        userName: user.name,
        req,
        details: { reason: valid ? 'account_disabled' : 'wrong_password', attempts: state?.failed_login_attempts },
      });
      throw new HttpError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
    }

    // Actualiza el hash al formato nuevo si venía del formato heredado.
    const rehash = isLegacyPasswordHash(user.password_hash) ? await hashPassword(password) : null;
    await query(
      `UPDATE users SET failed_login_attempts = 0, login_locked_until = NULL, last_login_at = NOW(),
         password_hash = COALESCE($2, password_hash)
       WHERE id = $1`,
      [user.id, rehash]
    );

    issueSession(res, { id: user.id, sessionVersion: user.session_version });
    await auditBestEffort({ eventType: 'LOGIN_SUCCESS', targetType: 'AUTH', userId: user.id, userEmail: user.email, userName: user.name, req });

    const [fresh] = await query<{ must_change_password: boolean; has_pin: boolean; role: string; key_environments: string[] }>(
      'SELECT must_change_password, (pin_hash IS NOT NULL) AS has_pin, role, key_environments FROM users WHERE id = $1',
      [user.id]
    );
    // El token va solo en la cookie HttpOnly: no se devuelve en el cuerpo (A-07).
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: fresh.role,
        hasPin: fresh.has_pin,
        mustChangePassword: fresh.must_change_password,
        keyEnvironments: fresh.key_environments,
      },
    });
  })
);

// POST /api/auth/logout — revoca todas las sesiones del usuario en el servidor (A-01)
router.post(
  '/logout',
  requireAuth,
  handler(async (req, res) => {
    const user = req.user!;
    await query('UPDATE users SET session_version = session_version + 1, vault_epoch = vault_epoch + 1 WHERE id = $1', [user.id]);
    clearSession(res);
    await auditBestEffort({ eventType: 'LOGOUT', targetType: 'AUTH', userId: user.id, userEmail: user.email, userName: user.name, req });
    res.json({ success: true });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// PUT /api/auth/profile — solo el nombre visible
router.put(
  '/profile',
  requireAuth,
  handler(async (req, res) => {
    const { name } = parse(profileSchema, req.body);
    const user = req.user!;
    await transaction(async (tx) => {
      await tx.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, user.id]);
      await auditStrict({ eventType: 'UPDATE_PROFILE', targetType: 'USER', targetId: user.id, targetTitle: user.email, userId: user.id, userEmail: user.email, userName: name, req }, tx);
    });
    res.json({ success: true, message: 'Perfil actualizado.' });
  })
);

const changePasswordLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: (req) => `chpwd:${req.user?.id}` });

// POST /api/auth/change-password — exige la contraseña actual; revoca las demás sesiones (M-02)
router.post(
  '/change-password',
  requireAuth,
  changePasswordLimit,
  handler(async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    const user = req.user!;
    const [row] = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);

    if (!(await verifyPassword(currentPassword, row?.password_hash))) {
      await auditBestEffort({ eventType: 'CHANGE_PASSWORD_FAILED', targetType: 'AUTH', userId: user.id, userEmail: user.email, userName: user.name, req });
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'La contraseña actual no es correcta.');
    }
    if (newPassword === currentPassword) throw new HttpError(400, 'SAME_PASSWORD', 'La nueva contraseña debe ser distinta de la actual.');
    if (newPassword.toLowerCase().includes(user.email.split('@')[0].toLowerCase())) {
      throw new HttpError(400, 'WEAK_PASSWORD', 'La contraseña no puede contener tu nombre de usuario.');
    }

    const hash = await hashPassword(newPassword);
    const [updated] = await transaction(async (tx) => {
      const result = await tx.query<{ session_version: number }>(
        `UPDATE users SET password_hash = $1, must_change_password = FALSE, password_changed_at = NOW(),
           session_version = session_version + 1, vault_epoch = vault_epoch + 1, updated_at = NOW()
         WHERE id = $2 RETURNING session_version`,
        [hash, user.id]
      );
      await auditStrict({ eventType: 'CHANGE_PASSWORD', targetType: 'AUTH', targetId: user.id, targetTitle: user.email, userId: user.id, userEmail: user.email, userName: user.name, req }, tx);
      return result;
    });

    // La sesión actual sigue con un token nuevo; las demás quedan revocadas.
    issueSession(res, { id: user.id, sessionVersion: updated.session_version });
    res.clearCookie('f1v_vault', { path: '/api' });
    res.json({ success: true, message: 'Contraseña actualizada. Se cerraron tus otras sesiones.' });
  })
);

export default router;
