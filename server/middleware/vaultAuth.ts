import type { Request, Response, NextFunction } from 'express';
import { verifyVaultSessionToken } from '../services/cryptoService.js';

export function requireVaultUnlocked(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-vault-token'] as string | undefined;

  if (!token) {
    res.status(403).json({
      error: 'VAULT_LOCKED',
      message: 'La bóveda se encuentra bloqueada. Ingresa el PIN de 4 dígitos para acceder a los datos.',
    });
    return;
  }

  const result = verifyVaultSessionToken(token);
  if (!result.valid) {
    res.status(403).json({
      error: 'VAULT_SESSION_EXPIRED',
      message: 'La sesión de desbloqueo de la bóveda ha expirado (15 min de inactividad). Vuelve a digitar el PIN.',
    });
    return;
  }

  next();
}
