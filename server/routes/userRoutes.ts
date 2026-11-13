import { Router, type Request } from 'express';
import { query, transaction, type Queryable } from '../db/connection.js';
import { hashPassword } from '../services/cryptoService.js';
import { auditStrict } from '../services/auditService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';
import { handler, HttpError, idParam, parse, requestParam, resetPasswordSchema, userCreateSchema, userUpdateSchema } from '../validation.js';

/**
 * Gestión de usuarios (solo admin, con la bóveda desbloqueada como verificación reciente).
 * Segregación de funciones (A-09):
 * - Nadie se cambia a sí mismo rol, estado, contraseña ni PIN desde aquí.
 * - Otorgar el rol admin requiere que lo apruebe un admin distinto de quien lo pidió.
 *   Excepción de arranque: si hay un solo admin activo, la promoción se aplica directa y queda marcada en la bitácora.
 * - El último admin activo no se puede degradar, deshabilitar ni eliminar.
 */
const router = Router();
router.use(requireAuth, requireAdmin, requireVaultUnlocked);

interface UserListRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  must_change_password: boolean;
  has_pin: boolean;
  key_environments: string[];
  locked: boolean;
}

const actor = (req: Request) => ({ userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name, req });

async function activeAdmins(tx: Queryable): Promise<number> {
  const [row] = await tx.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users WHERE role = 'admin' AND status = 'active'`);
  return Number(row.n);
}

async function getUser(tx: Queryable, id: string, lock = false) {
  const [row] = await tx.query<{ id: string; email: string; role: string; status: string }>(
    `SELECT id, email, role, status FROM users WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado.');
  return row;
}

const notSelf = (req: Request, id: string, message: string) => {
  if (id === req.user!.id) throw new HttpError(400, 'SELF_ACTION_FORBIDDEN', message);
};

// GET /api/users
router.get(
  '/',
  handler(async (_req, res) => {
    const rows = await query<UserListRow>(`
      SELECT id, email, name, role, status, last_login_at, created_at, must_change_password,
             (pin_hash IS NOT NULL) AS has_pin, key_environments,
             (COALESCE(login_locked_until, 'epoch') > NOW() OR COALESCE(pin_locked_until, 'epoch') > NOW()) AS locked
      FROM users ORDER BY role ASC, name ASC`);
    res.json({
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        lastLoginAt: u.last_login_at,
        createdAt: u.created_at,
        mustChangePassword: u.must_change_password,
        hasPin: u.has_pin,
        keyEnvironments: u.key_environments,
        locked: u.locked,
      })),
    });
  })
);

// POST /api/users — siempre como operador; el rol admin se otorga por solicitud aprobada
router.post(
  '/',
  handler(async (req, res) => {
    const data = parse(userCreateSchema, req.body);
    const hash = await hashPassword(data.temporaryPassword);
    try {
      await transaction(async (tx) => {
        const [row] = await tx.query<{ id: string }>(
          `INSERT INTO users (email, name, password_hash, role, status, must_change_password, key_environments)
           VALUES ($1, $2, $3, 'operator', 'active', TRUE, $4) RETURNING id`,
          [data.email, data.name, hash, data.keyEnvironments]
        );
        await auditStrict({ eventType: 'CREATE_USER', targetType: 'USER', targetId: row.id, targetTitle: data.email, ...actor(req), details: { keyEnvironments: data.keyEnvironments } }, tx);
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'EMAIL_TAKEN', 'Ya existe un usuario con ese correo.');
      throw err;
    }
    res.status(201).json({ success: true, message: `Usuario ${data.email} creado. Deberá cambiar la contraseña temporal al entrar.` });
  })
);

// PUT /api/users/:id — nombre, estado y entornos permitidos
router.put(
  '/:id',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const data = parse(userUpdateSchema, req.body);
    await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      if (id === req.user!.id && data.status !== target.status) throw new HttpError(400, 'SELF_ACTION_FORBIDDEN', 'No puedes cambiar el estado de tu propia cuenta.');
      if (target.role === 'admin' && target.status === 'active' && data.status === 'disabled' && (await activeAdmins(tx)) <= 1) {
        throw new HttpError(400, 'LAST_ADMIN', 'No puedes deshabilitar al último administrador activo.');
      }
      const revoke = data.status !== target.status;
      await tx.query(
        `UPDATE users SET name = $2, status = $3, key_environments = $4, updated_at = NOW(),
           session_version = session_version + $5, vault_epoch = vault_epoch + $5 WHERE id = $1`,
        [id, data.name, data.status, data.keyEnvironments, revoke ? 1 : 0]
      );
      await auditStrict({ eventType: 'UPDATE_USER', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req), details: { status: data.status, keyEnvironments: data.keyEnvironments } }, tx);
    });
    res.json({ success: true, message: 'Usuario actualizado.' });
  })
);

// POST /api/users/:id/demote — quitar el rol admin (no a uno mismo, no al último)
router.post(
  '/:id/demote',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    notSelf(req, id, 'No puedes quitarte el rol de administrador a ti mismo.');
    await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      if (target.role !== 'admin') throw new HttpError(400, 'NOT_ADMIN', 'El usuario no es administrador.');
      if (target.status === 'active' && (await activeAdmins(tx)) <= 1) throw new HttpError(400, 'LAST_ADMIN', 'Debe quedar al menos un administrador activo.');
      await tx.query(`UPDATE users SET role = 'operator', session_version = session_version + 1, vault_epoch = vault_epoch + 1, updated_at = NOW() WHERE id = $1`, [id]);
      await auditStrict({ eventType: 'DEMOTE_ADMIN', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req) }, tx);
    });
    res.json({ success: true, message: 'Rol de administrador retirado.' });
  })
);

// POST /api/users/:id/reset-password — contraseña temporal; revoca sus sesiones
router.post(
  '/:id/reset-password',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    notSelf(req, id, 'Para cambiar tu propia contraseña usa "Mi cuenta".');
    const { temporaryPassword } = parse(resetPasswordSchema, req.body);
    const hash = await hashPassword(temporaryPassword);
    await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      await tx.query(
        `UPDATE users SET password_hash = $2, must_change_password = TRUE, failed_login_attempts = 0, login_locked_until = NULL,
           session_version = session_version + 1, vault_epoch = vault_epoch + 1, updated_at = NOW() WHERE id = $1`,
        [id, hash]
      );
      await auditStrict({ eventType: 'RESET_PASSWORD', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req) }, tx);
    });
    res.json({ success: true, message: 'Contraseña temporal asignada. El usuario deberá cambiarla al entrar.' });
  })
);

// POST /api/users/:id/reset-pin — borra el PIN personal; el usuario define uno nuevo con su contraseña
router.post(
  '/:id/reset-pin',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    notSelf(req, id, 'No puedes resetear tu propio PIN: pídeselo a otro administrador.');
    await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      await tx.query(
        `UPDATE users SET pin_hash = NULL, pin_set_at = NULL, pin_failed_attempts = 0, pin_locked_until = NULL, vault_epoch = vault_epoch + 1 WHERE id = $1`,
        [id]
      );
      await auditStrict({ eventType: 'RESET_PIN', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req) }, tx);
    });
    res.json({ success: true, message: 'PIN reseteado. El usuario definirá uno nuevo en su próximo ingreso a la bóveda.' });
  })
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    notSelf(req, id, 'No puedes eliminar tu propia cuenta.');
    await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      if (target.role === 'admin' && target.status === 'active' && (await activeAdmins(tx)) <= 1) {
        throw new HttpError(400, 'LAST_ADMIN', 'No puedes eliminar al último administrador activo.');
      }
      await tx.query('DELETE FROM users WHERE id = $1', [id]);
      await auditStrict({ eventType: 'DELETE_USER', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req) }, tx);
    });
    res.json({ success: true, message: 'Usuario eliminado.' });
  })
);

// ── Solicitudes para otorgar el rol admin ──────────────────────────────────

// GET /api/users/admin-requests
router.get(
  '/admin-requests',
  handler(async (_req, res) => {
    const rows = await query(`
      SELECT r.id, r.target_user_id, u.email AS target_email, u.name AS target_name, r.requested_by, r.requested_by_email,
             r.status, r.decided_by_email, r.created_at, r.decided_at
      FROM admin_role_requests r JOIN users u ON u.id = r.target_user_id
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 50`);
    res.json({
      items: rows.map((r: any) => ({
        id: r.id,
        targetUserId: r.target_user_id,
        targetEmail: r.target_email,
        targetName: r.target_name,
        requestedBy: r.requested_by,
        requestedByEmail: r.requested_by_email,
        status: r.status,
        decidedByEmail: r.decided_by_email,
        createdAt: r.created_at,
        decidedAt: r.decided_at,
      })),
    });
  })
);

// POST /api/users/:id/admin-request
router.post(
  '/:id/admin-request',
  handler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    notSelf(req, id, 'No puedes solicitar el rol de administrador para ti.');
    const outcome = await transaction(async (tx) => {
      const target = await getUser(tx, id, true);
      if (target.role === 'admin') throw new HttpError(400, 'ALREADY_ADMIN', 'El usuario ya es administrador.');
      if (target.status !== 'active') throw new HttpError(400, 'USER_DISABLED', 'El usuario está deshabilitado.');

      // Arranque: con un solo admin no hay nadie más que apruebe; se aplica y queda marcado.
      if ((await activeAdmins(tx)) <= 1) {
        await tx.query(`UPDATE users SET role = 'admin', session_version = session_version + 1, vault_epoch = vault_epoch + 1, updated_at = NOW() WHERE id = $1`, [id]);
        await tx.query(
          `INSERT INTO admin_role_requests (target_user_id, requested_by, requested_by_email, status, decided_by, decided_by_email, decided_at)
           VALUES ($1, $2, $3, 'approved', $2, $3, NOW())`,
          [id, req.user!.id, req.user!.email]
        );
        await auditStrict({ eventType: 'GRANT_ADMIN', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req), details: { bootstrap: true } }, tx);
        return 'granted';
      }

      try {
        await tx.query(`INSERT INTO admin_role_requests (target_user_id, requested_by, requested_by_email) VALUES ($1, $2, $3)`, [id, req.user!.id, req.user!.email]);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'REQUEST_PENDING', 'Ya hay una solicitud pendiente para este usuario.');
        throw err;
      }
      await auditStrict({ eventType: 'REQUEST_ADMIN', targetType: 'USER', targetId: id, targetTitle: target.email, ...actor(req) }, tx);
      return 'pending';
    });
    res.status(outcome === 'pending' ? 202 : 200).json({
      success: true,
      status: outcome,
      message: outcome === 'pending' ? 'Solicitud creada. Otro administrador debe aprobarla.' : 'Eres el único administrador: el rol se otorgó directamente y quedó registrado.',
    });
  })
);

async function decide(req: Request, approve: boolean) {
  const { rid } = parse(requestParam, req.params);
  return transaction(async (tx) => {
    const [request] = await tx.query<{ id: string; target_user_id: string; requested_by: string | null; status: string }>(
      'SELECT id, target_user_id, requested_by, status FROM admin_role_requests WHERE id = $1 FOR UPDATE',
      [rid]
    );
    if (!request) throw new HttpError(404, 'NOT_FOUND', 'Solicitud no encontrada.');
    if (request.status !== 'pending') throw new HttpError(409, 'ALREADY_DECIDED', 'La solicitud ya fue resuelta.');
    const me = req.user!.id;
    const ownRequest = request.requested_by === me;
    // Quien pidió puede cancelar, pero nunca aprobar su propia solicitud; nadie se aprueba a sí mismo.
    if (approve && (ownRequest || request.target_user_id === me)) {
      throw new HttpError(403, 'SELF_APPROVAL_FORBIDDEN', 'Una solicitud debe aprobarla un administrador distinto de quien la creó.');
    }
    const target = await getUser(tx, request.target_user_id, true);
    const status = approve ? 'approved' : ownRequest ? 'cancelled' : 'rejected';
    await tx.query(`UPDATE admin_role_requests SET status = $2, decided_by = $3, decided_by_email = $4, decided_at = NOW() WHERE id = $1`, [rid, status, me, req.user!.email]);
    if (approve) {
      if (target.status !== 'active') throw new HttpError(400, 'USER_DISABLED', 'El usuario está deshabilitado.');
      await tx.query(`UPDATE users SET role = 'admin', session_version = session_version + 1, vault_epoch = vault_epoch + 1, updated_at = NOW() WHERE id = $1`, [target.id]);
    }
    await auditStrict({ eventType: approve ? 'GRANT_ADMIN' : 'REJECT_ADMIN_REQUEST', targetType: 'USER', targetId: target.id, targetTitle: target.email, ...actor(req), details: { requestId: rid, status } }, tx);
    return status;
  });
}

router.post('/admin-requests/:rid/approve', handler(async (req, res) => {
  await decide(req, true);
  res.json({ success: true, message: 'Solicitud aprobada: el usuario ahora es administrador.' });
}));

router.post('/admin-requests/:rid/reject', handler(async (req, res) => {
  const status = await decide(req, false);
  res.json({ success: true, message: status === 'cancelled' ? 'Solicitud cancelada.' : 'Solicitud rechazada.' });
}));

export default router;
