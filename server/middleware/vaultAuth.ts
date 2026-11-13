import type { NextFunction, Request, Response } from 'express';
import { createVaultToken, verifyVaultToken, VAULT_IDLE_SECONDS, type VaultTokenPayload } from '../services/cryptoService.js';
import { cookieOptions, VAULT_COOKIE, type AuthenticatedUser } from './auth.js';

/** Emite el token de bóveda en una cookie HttpOnly (no queda al alcance de JavaScript, A-02). */
export function setVaultCookie(res: Response, user: AuthenticatedUser, abs?: number): VaultTokenPayload {
  const { token, payload } = createVaultToken({ uid: user.id, sv: user.sessionVersion, ve: user.vaultEpoch, abs });
  res.cookie(VAULT_COOKIE, token, cookieOptions(payload.exp - Date.now(), '/api'));
  return payload;
}

/** Valida el token de bóveda contra el usuario de la sesión actual. Devuelve null si no corresponde. */
export function currentVaultSession(req: Request): VaultTokenPayload | null {
  const user = req.user;
  if (!user) return null;
  const payload = verifyVaultToken(req.cookies?.[VAULT_COOKIE]);
  if (!payload) return null;
  // Ligado al usuario, a su sesión y a la época de bóveda: bloquear o cerrar sesión lo invalida en el servidor.
  if (payload.uid !== user.id || payload.sv !== user.sessionVersion || payload.ve !== user.vaultEpoch) return null;
  return payload;
}

/** Exige bóveda desbloqueada. Renueva la caducidad por inactividad (15 min) sin pasar el límite absoluto. */
export function requireVaultUnlocked(req: Request, res: Response, next: NextFunction): void {
  const session = currentVaultSession(req);
  if (!session) {
    res.clearCookie(VAULT_COOKIE, { path: '/api' });
    res.status(403).json({
      error: req.cookies?.[VAULT_COOKIE] ? 'VAULT_SESSION_EXPIRED' : 'VAULT_LOCKED',
      message: 'La bóveda está bloqueada. Ingresa tu PIN personal para continuar.',
    });
    return;
  }
  // Renovar como máximo una vez por minuto para no reemitir en cada petición.
  if (Date.now() - session.iat > 60_000 && session.exp < session.abs) {
    const renewed = setVaultCookie(res, req.user!, session.abs);
    res.setHeader('X-Vault-Expires-At', new Date(renewed.exp).toISOString());
  } else {
    res.setHeader('X-Vault-Expires-At', new Date(session.exp).toISOString());
  }
  next();
}

export const VAULT_IDLE_MS = VAULT_IDLE_SECONDS * 1000;
