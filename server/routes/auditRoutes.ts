import { Router } from 'express';
import { query } from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';

const router = Router();

router.use(requireAuth);
router.use(requireVaultUnlocked);

// GET /api/vault/audit
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const eventType = req.query.eventType as string | undefined;
  const targetType = req.query.targetType as string | undefined;
  const search = req.query.search as string | undefined;

  try {
    const conditions: string[] = [];
    const values: any[] = [];
    let pIdx = 1;

    if (eventType && eventType !== 'ALL') {
      conditions.push(`event_type = $${pIdx++}`);
      values.push(eventType);
    }

    if (targetType && targetType !== 'ALL') {
      conditions.push(`target_type = $${pIdx++}`);
      values.push(targetType);
    }

    if (search && search.trim()) {
      conditions.push(`(target_title ILIKE $${pIdx} OR user_email ILIKE $${pIdx} OR user_name ILIKE $${pIdx})`);
      values.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM vault_audit_logs ${whereClause};`,
      values
    );
    const totalCount = parseInt(countRows[0]?.count || '0', 10);

    const logsSql = `
      SELECT 
        id, event_type, target_type, target_id, target_title,
        user_email, user_name, ip_address, user_agent, details,
        created_at
      FROM vault_audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++};
    `;
    values.push(limit, offset);

    const items = await query<any>(logsSql, values);

    res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (err: any) {
    console.error('Error al consultar bitácora de auditoría:', err);
    res.status(500).json({ error: 'Error al consultar bitácora de auditoría.' });
  }
});

export default router;

