import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.js';
import { db } from './db/connection.js';
import { setSecureCookies } from './middleware/auth.js';
import { originGuard, rateLimit, securityHeaders } from './middleware/security.js';
import { clientIp } from './services/auditService.js';
import { HttpError } from './validation.js';
import authRoutes from './routes/authRoutes.js';
import vaultAuthRoutes from './routes/vaultAuthRoutes.js';
import { keyRoutes, passwordRoutes } from './routes/itemRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import userRoutes from './routes/userRoutes.js';

/** Construye la aplicación Express (sin abrir el puerto): así también la usan las pruebas. */
export function createApp(config: Pick<AppConfig, 'isProduction' | 'corsOrigins' | 'trustProxy'>, options: { staticDir?: string | null } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  setSecureCookies(config.isProduction);

  app.use(securityHeaders(config.isProduction));
  app.use('/api', rateLimit({ windowMs: 60_000, max: 600, key: (req) => `api:${clientIp(req)}` }));
  app.use('/api', originGuard(config.corsOrigins));
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  // Salud: consulta la BD para que Railway no dé por sano un servicio sin base (M-03).
  app.get('/api/health', async (_req, res) => {
    const database = await db().ping();
    res.status(database ? 200 : 503).json({ status: database ? 'ok' : 'degraded', database });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/vault/passwords', passwordRoutes);
  app.use('/api/vault/keys', keyRoutes);
  app.use('/api/vault/audit', auditRoutes);
  app.use('/api/vault', vaultAuthRoutes);
  app.use('/api/users', userRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint no encontrado.' });
  });

  const staticDir = options.staticDir;
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: '1y', immutable: true }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // Manejador central: respuestas genéricas, sin detalles técnicos hacia el cliente.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
      return;
    }
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.too.large') {
      res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: 'El contenido enviado es demasiado grande.' });
      return;
    }
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'INVALID_JSON', message: 'El cuerpo de la petición no es JSON válido.' });
      return;
    }
    console.error(`[error] ${req.method} ${req.path}:`, err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Inténtalo de nuevo.' });
  });

  return app;
}
