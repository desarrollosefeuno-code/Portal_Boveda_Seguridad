import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';
import { verifyPassword, hashPassword } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'f1_keyvault_jwt_session_signing_secret_super_long_32chars_minimum';
const SESSION_DURATION_HOURS = 8;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    res.status(400).json({ error: 'Debes proporcionar correo electrónico y contraseña.' });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const users = await query<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: 'admin' | 'operator';
      status: string;
    }>('SELECT id, email, name, password_hash, role, status FROM users WHERE email = $1;', [cleanEmail]);

    const user = users[0];

    if (!user || user.status !== 'active') {
      await logAuditEvent({
        eventType: 'LOGIN_FAILED',
        targetType: 'AUTH',
        userEmail: cleanEmail,
        req,
        details: { reason: !user ? 'Usuario no registrado' : 'Usuario deshabilitado' },
      });
      res.status(401).json({ error: 'Credenciales inválidas o cuenta deshabilitada.' });
      return;
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      await logAuditEvent({
        eventType: 'LOGIN_FAILED',
        targetType: 'AUTH',
        userEmail: cleanEmail,
        userName: user.name,
        req,
        details: { reason: 'Contraseña incorrecta' },
      });
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // Actualizar último inicio de sesión
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1;', [user.id]);

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: `${SESSION_DURATION_HOURS}h`,
    });

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_DURATION_HOURS * 60 * 60 * 1000,
      path: '/',
    });

    await logAuditEvent({
      eventType: 'LOGIN_SUCCESS',
      targetType: 'AUTH',
      userEmail: user.email,
      userName: user.name,
      req,
    });

    res.status(200).json({
      success: true,
      user: payload,
      token, // También se entrega para clientes que usan Authorization: Bearer
    });
  } catch (err: any) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno al procesar el inicio de sesión.' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  res.clearCookie('auth_token', { path: '/' });
  if (req.user) {
    await logAuditEvent({
      eventType: 'LOGOUT',
      targetType: 'AUTH',
      userEmail: req.user.email,
      userName: req.user.name,
      req,
    });
  }
  res.status(200).json({ success: true, message: 'Sesión finalizada correctamente.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const users = await query<{
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'operator';
      status: string;
      last_login_at: string;
      created_at: string;
    }>('SELECT id, email, name, role, status, last_login_at, created_at FROM users WHERE id = $1;', [req.user!.id]);

    const user = users[0];
    if (!user || user.status !== 'active') {
      res.status(401).json({ error: 'Usuario no encontrado o inactivo.' });
      return;
    }

    res.status(200).json({ user });
  } catch (err: any) {
    console.error('Error en /me:', err);
    res.status(500).json({ error: 'Error al consultar perfil de usuario.' });
  }
});

// PUT /api/auth/profile (Actualizar nombre o contraseña propia)
router.put('/profile', requireAuth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body || {};

  try {
    const users = await query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE id = $1;',
      [req.user!.id]
    );
    const user = users[0];
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    if (newPassword) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Debes ingresar tu contraseña actual para cambiarla.' });
        return;
      }
      const isCurrentValid = await verifyPassword(currentPassword, user.password_hash);
      if (!isCurrentValid) {
        res.status(400).json({ error: 'La contraseña actual no es correcta.' });
        return;
      }
      if (newPassword.length < 8) {
        res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
        return;
      }
      const newHash = await hashPassword(newPassword);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2;', [newHash, req.user!.id]);
    }

    if (name && typeof name === 'string' && name.trim()) {
      await query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2;', [name.trim(), req.user!.id]);
    }

    res.status(200).json({ success: true, message: 'Perfil actualizado exitosamente.' });
  } catch (err: any) {
    console.error('Error al actualizar perfil:', err);
    res.status(500).json({ error: 'Error al actualizar perfil.' });
  }
});

export default router;

