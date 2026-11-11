import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token =
    req.cookies?.auth_token ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sesión no iniciada o token ausente.' });
    return;
  }

  const secret = process.env.JWT_SECRET || 'f1_keyvault_jwt_session_signing_secret_super_long_32chars_minimum';

  try {
    const decoded = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'SESSION_EXPIRED', message: 'Tu sesión ha expirado. Por favor inicia sesión nuevamente.' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'FORBIDDEN', message: 'Esta acción requiere privilegios de Administrador.' });
    return;
  }
  next();
}

