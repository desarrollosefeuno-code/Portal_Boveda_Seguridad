import type { CookieOptions, NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { jwtSigningKey } from '../services/cryptoService.js';

export type Role = 'admin' | 'operator';
export type Environment = 'PROD' | 'STAGING' | 'QA' | 'DEV';

/** Usuario cargado desde la BD en cada petición: estado y rol siempre vigentes (A-01). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionVersion: number;
  vaultEpoch: number;
  mustChangePassword: boolean;
  hasPin: boolean;
  keyEnvironments: Environment[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const SESSION_COOKIE = 'f1v_session';
export const VAULT_COOKIE = 'f1v_vault';
const LEGACY_COOKIE = 'auth_token';
export const SESSION_HOURS = 8;
const ISSUER = 'f1-keyvault';
const AUDIENCE = 'f1-keyvault-web';

let secureCookies = true;
export const setSecureCookies = (value: boolean) => {
  secureCookies = value;
};

export const cookieOptions = (maxAgeMs: number, path = '/'): CookieOptions => ({
  httpOnly: true,
  secure: secureCookies,
  sameSite: 'strict',
  maxAge: maxAgeMs,
  path,
});

export function issueSession(res: Response, user: { id: string; sessionVersion: number }): void {
  const token = jwt.sign({ sv: user.sessionVersion }, jwtSigningKey(), {
    algorithm: 'HS256',
    subject: user.id,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: `${SESSION_HOURS}h`,
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_HOURS * 3600 * 1000));
  res.clearCookie(LEGACY_COOKIE, { path: '/' });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(VAULT_COOKIE, { path: '/api' });
  res.clearCookie(LEGACY_COOKIE, { path: '/' });
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: string;
  session_version: number;
  vault_epoch: number;
  must_change_password: boolean;
  has_pin: boolean;
  key_environments: Environment[];
}

export async function loadUser(id: string): Promise<(AuthenticatedUser & { status: string }) | null> {
  const rows = await query<UserRow>(
    `SELECT id, email, name, role, status, session_version, vault_epoch, must_change_password,
            (pin_hash IS NOT NULL) AS has_pin, key_environments
     FROM users WHERE id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    sessionVersion: row.session_version,
    vaultEpoch: row.vault_epoch,
    mustChangePassword: row.must_change_password,
    hasPin: row.has_pin,
    keyEnvironments: row.key_environments ?? [],
  };
}

/** Rutas permitidas mientras el usuario debe cambiar su contraseña. */
const ALLOWED_WHILE_MUST_CHANGE = new Set(['/api/auth/me', '/api/auth/logout', '/api/auth/change-password']);

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sesión no iniciada.' });
    return;
  }

  let claims: jwt.JwtPayload;
  try {
    claims = jwt.verify(token, jwtSigningKey(), { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE }) as jwt.JwtPayload;
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Tu sesión ha expirado. Inicia sesión nuevamente.' });
    return;
  }

  try {
    const user = claims.sub ? await loadUser(claims.sub) : null;
    // Usuario eliminado, deshabilitado o sesión revocada (logout, cambio de clave o de rol): termina aquí.
    if (!user || user.status !== 'active' || user.sessionVersion !== claims.sv) {
      clearSession(res);
      res.status(401).json({ error: 'SESSION_REVOKED', message: 'Tu sesión ya no es válida. Inicia sesión nuevamente.' });
      return;
    }
    if (user.mustChangePassword && !ALLOWED_WHILE_MUST_CHANGE.has(req.originalUrl.split('?')[0])) {
      res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña antes de continuar.' });
      return;
    }
    const { status: _status, ...authUser } = user;
    req.user = authUser;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Esta acción requiere privilegios de Administrador.' });
    return;
  }
  next();
}
