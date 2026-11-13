import type { NextFunction, Request, Response } from 'express';

/** Cabecera propia que exige el cliente en toda petición que cambia datos (defensa CSRF, A-07). */
export const CSRF_HEADER = 'x-f1-vault';

/** Cabeceras de seguridad (M-02): CSP estricta, sin marcos, sin caché de respuestas del API. */
export function securityHeaders(isProduction: boolean) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=()');
    res.removeHeader('X-Powered-By');
    if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    }
    next();
  };
}

/**
 * CORS con lista blanca (A-07). Sin CORS_ORIGINS, el API solo atiende a su mismo origen.
 * Además, toda petición que cambia datos debe traer la cabecera propia y un Origin permitido.
 */
export function originGuard(allowed: string[]) {
  const allowList = new Set(allowed);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    // Detrás de un proxy (Railway, Cloudflare) el host público puede venir en X-Forwarded-Host.
    // Un sitio ajeno no puede fijar esa cabecera sin pasar por el preflight, que aquí se rechaza.
    const hosts = [req.headers.host, ...String(req.headers['x-forwarded-host'] || '').split(',').map((h) => h.trim())].filter(Boolean);
    const sameOrigin = origin ? hosts.includes(safeHost(origin) ?? '') : true;
    // Sin Origin (navegación directa, curl) se permite; "null" (sandbox, archivos locales) nunca.
    const permitted = !origin ? true : origin !== 'null' && (sameOrigin || allowList.has(origin));

    if (origin && allowList.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      if (!origin || !allowList.has(origin)) {
        res.status(403).end();
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${CSRF_HEADER}`);
      res.setHeader('Access-Control-Max-Age', '600');
      res.status(204).end();
      return;
    }

    if (!permitted) {
      res.status(403).json({ error: 'ORIGIN_NOT_ALLOWED', message: 'Origen no permitido.' });
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method) && req.headers[CSRF_HEADER] !== '1') {
      res.status(403).json({ error: 'CSRF_HEADER_MISSING', message: 'Petición rechazada por protección CSRF.' });
      return;
    }
    next();
  };
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Límite de peticiones en memoria con ventana deslizante (A-06). Pensado para una sola instancia
 * (Railway); si se escala horizontalmente, conviene moverlo a Redis o a la BD.
 */
export function rateLimit(options: { windowMs: number; max: number; key: (req: Request) => string; message?: string }) {
  const hits = new Map<string, number[]>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, list] of hits) {
      const fresh = list.filter((t) => now - t < options.windowMs);
      if (fresh.length) hits.set(k, fresh);
      else hits.delete(k);
    }
  }, Math.min(options.windowMs, 60_000));
  timer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const k = options.key(req);
    const list = (hits.get(k) ?? []).filter((t) => now - t < options.windowMs);
    if (list.length >= options.max) {
      const retry = Math.ceil((options.windowMs - (now - list[0])) / 1000);
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: options.message ?? 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
        retryAfterSeconds: retry,
      });
      return;
    }
    list.push(now);
    hits.set(k, list);
    next();
  };
}
