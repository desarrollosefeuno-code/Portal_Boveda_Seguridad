import type { Request } from 'express';
import { query, type Queryable } from '../db/connection.js';

export type AuditTarget = 'PASSWORD' | 'KEY' | 'VAULT' | 'USER' | 'AUTH';

export interface AuditLogParams {
  eventType: string;
  targetType?: AuditTarget;
  targetId?: string | null;
  targetTitle?: string | null;
  userId?: string | null;
  userEmail: string;
  userName?: string | null;
  req?: Request;
  details?: Record<string, unknown>;
}

/** IP del cliente según `trust proxy` de Express: no se lee X-Forwarded-For a mano (A-08). */
export const clientIp = (req: Request): string => (req.ip || req.socket?.remoteAddress || 'desconocida').slice(0, 64);

const INSERT = `
  INSERT INTO vault_audit_logs (event_type, target_type, target_id, target_title, user_id, user_email, user_name, ip_address, user_agent, details)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

function values(p: AuditLogParams): unknown[] {
  return [
    p.eventType,
    p.targetType ?? null,
    p.targetId ?? null,
    p.targetTitle?.slice(0, 300) ?? null,
    p.userId ?? null,
    p.userEmail.toLowerCase().trim().slice(0, 254),
    p.userName?.slice(0, 120) ?? null,
    p.req ? clientIp(p.req) : null,
    p.req ? String(p.req.headers['user-agent'] || '').slice(0, 300) || null : null,
    JSON.stringify(p.details ?? {}),
  ];
}

/**
 * Registro obligatorio: si falla, lanza el error y la operación no se completa (falla cerrada).
 * Úsalo dentro de la misma transacción que el cambio, o antes de entregar un secreto.
 */
export async function auditStrict(p: AuditLogParams, tx?: Queryable): Promise<void> {
  await (tx ?? { query }).query(INSERT, values(p));
}

/** Registro de mejor esfuerzo, para eventos que no deben bloquear la respuesta (intentos fallidos). */
export async function auditBestEffort(p: AuditLogParams): Promise<void> {
  try {
    await query(INSERT, values(p));
  } catch (err) {
    console.error('[auditoría] No se pudo registrar el evento', p.eventType, err instanceof Error ? err.message : err);
  }
}
