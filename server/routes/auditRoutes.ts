import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';
import { auditQuery, handler, parse } from '../validation.js';

/** Bitácora: el admin ve todo; el operador solo sus propios eventos (IPs y equipos de otros quedan reservados). */
const router = Router();
router.use(requireAuth, requireVaultUnlocked);

router.get(
  '/',
  handler(async (req, res) => {
    const { page, limit, eventType, targetType, search } = parse(auditQuery, req.query);
    const user = req.user!;
    const conditions: string[] = [];
    const values: unknown[] = [];
    /** Agrega un valor y devuelve su marcador ($n). */
    const param = (value: unknown) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (user.role !== 'admin') {
      conditions.push(`(user_id = ${param(user.id)} OR (user_id IS NULL AND user_email = ${param(user.email)}))`);
    }
    if (eventType && eventType !== 'ALL') conditions.push(`event_type = ${param(eventType)}`);
    if (targetType && targetType !== 'ALL') conditions.push(`target_type = ${param(targetType)}`);
    if (search) {
      const term = param(`%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      conditions.push(`(target_title ILIKE ${term} OR user_email ILIKE ${term} OR user_name ILIKE ${term})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    // Una sola consulta: total con función de ventana en vez de un COUNT aparte (M-07)
    const rows = await query<Record<string, unknown> & { total: string }>(
      `SELECT id, event_type, target_type, target_id, target_title, user_email, user_name, ip_address, user_agent, details, created_at,
              COUNT(*) OVER()::text AS total
       FROM vault_audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const totalCount = rows[0] ? Number.parseInt(rows[0].total, 10) : 0;
    res.json({
      items: rows.map(({ total: _t, ...item }) => item),
      pagination: { page, limit, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / limit)) },
      scope: user.role === 'admin' ? 'all' : 'own',
    });
  })
);

export default router;
