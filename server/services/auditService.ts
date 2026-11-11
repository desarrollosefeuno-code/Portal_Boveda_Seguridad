import type { Request } from 'express';
import { query } from '../db/connection.js';

export interface AuditLogParams {
  eventType: string;
  targetType?: 'PASSWORD' | 'KEY' | 'VAULT' | 'USER' | 'AUTH';
  targetId?: string;
  targetTitle?: string;
  userEmail: string;
  userName?: string;
  req?: Request;
  details?: Record<string, any>;
}

export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    let ipAddress: string | undefined;
    let userAgent: string | undefined;

    if (params.req) {
      ipAddress =
        (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        params.req.socket?.remoteAddress ||
        params.req.ip;
      userAgent = params.req.headers['user-agent'];
    }

    await query(
      `
      INSERT INTO vault_audit_logs (
        event_type,
        target_type,
        target_id,
        target_title,
        user_email,
        user_name,
        ip_address,
        user_agent,
        details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
    `,
      [
        params.eventType,
        params.targetType || null,
        params.targetId || null,
        params.targetTitle || null,
        params.userEmail.toLowerCase().trim(),
        params.userName || null,
        ipAddress || '127.0.0.1',
        userAgent || 'Unknown',
        JSON.stringify(params.details || {}),
      ]
    );
  } catch (err) {
    console.error('Error al registrar evento de auditoría:', err);
  }
}
