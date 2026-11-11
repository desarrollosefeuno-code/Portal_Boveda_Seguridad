import { Router } from 'express';
import { query } from '../db/connection.js';
import { hashPassword } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const users = await query<{
      id: string;
      email: string;
      name: string;
      role: string;
      status: string;
      last_login_at: string | null;
      created_at: string;
    }>(`
      SELECT id, email, name, role, status, last_login_at, created_at 
      FROM users 
      ORDER BY role ASC, created_at DESC;
    `);

    res.status(200).json({ users });
  } catch (err: any) {
    console.error('Error al listar usuarios:', err);
    res.status(500).json({ error: 'Error al consultar usuarios.' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { email, name, password, role } = req.body || {};

  if (!email || typeof email !== 'string' || !name || typeof name !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Email, nombre y contraseña son requeridos.' });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const validRole = role === 'admin' ? 'admin' : 'operator';

  try {
    const existing = await query('SELECT id FROM users WHERE email = $1;', [cleanEmail]);
    if (existing.length > 0) {
      res.status(409).json({ error: 'Ya existe un usuario registrado con este correo electrónico.' });
      return;
    }

    const passwordHash = await hashPassword(password);

    const result = await query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role, status) VALUES ($1, $2, $3, $4, 'active') RETURNING id;`,
      [cleanEmail, name.trim(), passwordHash, validRole]
    );

    await logAuditEvent({
      eventType: 'CREATE_USER',
      targetType: 'USER',
      targetId: result[0]?.id,
      targetTitle: cleanEmail,
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { role: validRole },
    });

    res.status(201).json({ success: true, message: `Usuario ${cleanEmail} creado exitosamente.` });
  } catch (err: any) {
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error al registrar nuevo usuario.' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, role, status, newPassword } = req.body || {};

  try {
    const existing = await query<{ email: string; role: string }>('SELECT email, role FROM users WHERE id = $1;', [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (id === req.user!.id && status === 'disabled') {
      res.status(400).json({ error: 'No puedes deshabilitar tu propia cuenta de administrador.' });
      return;
    }

    let passwordUpdateClause = '';
    const params: any[] = [name.trim(), role === 'admin' ? 'admin' : 'operator', status === 'disabled' ? 'disabled' : 'active', id];

    if (newPassword && typeof newPassword === 'string' && newPassword.length >= 8) {
      const hash = await hashPassword(newPassword);
      passwordUpdateClause = ', password_hash = $5';
      params.splice(3, 0, hash); // insert hash before id
    }

    const sql = `
      UPDATE users 
      SET 
        name = $1, 
        role = $2, 
        status = $3
        ${passwordUpdateClause},
        updated_at = NOW() 
      WHERE id = $${params.length};
    `;

    await query(sql, params);

    await logAuditEvent({
      eventType: 'UPDATE_USER',
      targetType: 'USER',
      targetId: id,
      targetTitle: existing[0].email,
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { role, status, passwordReset: Boolean(newPassword) },
    });

    res.status(200).json({ success: true, message: 'Usuario actualizado exitosamente.' });
  } catch (err: any) {
    console.error('Error al actualizar usuario:', err);
    res.status(500).json({ error: 'Error al actualizar usuario.' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (id === req.user!.id) {
    res.status(400).json({ error: 'No puedes eliminar tu propia cuenta de administrador.' });
    return;
  }

  try {
    const existing = await query<{ email: string }>('SELECT email FROM users WHERE id = $1;', [id]);
    if (existing.length === 0) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    await query('DELETE FROM users WHERE id = $1;', [id]);

    await logAuditEvent({
      eventType: 'DELETE_USER',
      targetType: 'USER',
      targetId: id,
      targetTitle: existing[0].email,
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
    });

    res.status(200).json({ success: true, message: 'Usuario eliminado exitosamente.' });
  } catch (err: any) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

export default router;

