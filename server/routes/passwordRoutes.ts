import { Router } from 'express';
import { query } from '../db/connection.js';
import { encryptValue, decryptValue } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireAuth } from '../middleware/auth.js';
import { requireVaultUnlocked } from '../middleware/vaultAuth.js';

const router = Router();

// Todas las rutas requieren usuario autenticado Y bóveda desbloqueada con PIN
router.use(requireAuth);
router.use(requireVaultUnlocked);

// GET /api/vault/passwords
router.get('/', async (req, res) => {
  try {
    const rows = await query<{
      id: string;
      title: string;
      category: string;
      url: string | null;
      username: string | null;
      encrypted_password: string;
      encrypted_additional_fields: string | null;
      encrypted_notes: string | null;
      is_favorite: boolean;
      tags: string[];
      created_by: string;
      updated_by: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT 
        id, title, category, url, username, 
        encrypted_password, encrypted_additional_fields, encrypted_notes,
        is_favorite, tags, created_by, updated_by, created_at, updated_at
      FROM vault_passwords
      ORDER BY is_favorite DESC, updated_at DESC;
    `);

    // Descifrar entradas para el usuario que tiene la bóveda desbloqueada
    const items = rows.map((row) => {
      let password = '';
      let additionalFields: any[] = [];
      let notes = '';

      try {
        password = decryptValue(row.encrypted_password);
      } catch (e) {
        password = '*** ERROR DE DESCIFRADO ***';
      }

      if (row.encrypted_additional_fields) {
        try {
          const rawJson = decryptValue(row.encrypted_additional_fields);
          additionalFields = JSON.parse(rawJson);
        } catch {
          additionalFields = [];
        }
      }

      if (row.encrypted_notes) {
        try {
          notes = decryptValue(row.encrypted_notes);
        } catch {
          notes = '';
        }
      }

      return {
        id: row.id,
        title: row.title,
        category: row.category,
        url: row.url || '',
        username: row.username || '',
        password,
        additionalFields,
        notes,
        isFavorite: Boolean(row.is_favorite),
        tags: Array.isArray(row.tags) ? row.tags : [],
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    res.status(200).json({ items });
  } catch (err: any) {
    console.error('Error al obtener contraseñas de portales:', err);
    res.status(500).json({ error: 'Error al consultar contraseñas.' });
  }
});

// POST /api/vault/passwords
router.post('/', async (req, res) => {
  const { title, category, url, username, password, additionalFields, notes, isFavorite, tags } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'El título o nombre del portal es obligatorio.' });
    return;
  }

  if (!password || typeof password !== 'string') {
    res.status(400).json({ error: 'La contraseña es obligatoria.' });
    return;
  }

  try {
    const encryptedPassword = encryptValue(password);
    const encryptedFields = Array.isArray(additionalFields) && additionalFields.length > 0
      ? encryptValue(JSON.stringify(additionalFields))
      : null;
    const encryptedNotes = typeof notes === 'string' && notes.trim()
      ? encryptValue(notes.trim())
      : null;

    const author = req.user?.email || 'Usuario';
    const cleanTags = Array.isArray(tags) ? tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    const result = await query<{ id: string }>(
      `
      INSERT INTO vault_passwords (
        title, category, url, username,
        encrypted_password, encrypted_additional_fields, encrypted_notes,
        is_favorite, tags, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      RETURNING id;
    `,
      [
        title.trim(),
        (category || 'General').trim(),
        url ? url.trim() : null,
        username ? username.trim() : null,
        encryptedPassword,
        encryptedFields,
        encryptedNotes,
        Boolean(isFavorite),
        cleanTags,
        author,
      ]
    );

    const newId = result[0]?.id;

    await logAuditEvent({
      eventType: 'CREATE_PASSWORD',
      targetType: 'PASSWORD',
      targetId: newId,
      targetTitle: title.trim(),
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
    });

    res.status(201).json({ success: true, id: newId, message: 'Credencial guardada y cifrada con AES-256-GCM.' });
  } catch (err: any) {
    console.error('Error al crear credencial de portal:', err);
    res.status(500).json({ error: 'Error al guardar la credencial.' });
  }
});

// PUT /api/vault/passwords/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { title, category, url, username, password, additionalFields, notes, isFavorite, tags } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  try {
    const existing = await query<{ encrypted_password: string }>(
      'SELECT encrypted_password FROM vault_passwords WHERE id = $1;',
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Credencial no encontrada.' });
      return;
    }

    let encryptedPassword = existing[0].encrypted_password;
    if (password && typeof password === 'string' && password.trim() && password !== '••••••••••••') {
      encryptedPassword = encryptValue(password);
    }

    const encryptedFields = Array.isArray(additionalFields) && additionalFields.length > 0
      ? encryptValue(JSON.stringify(additionalFields))
      : null;
    const encryptedNotes = typeof notes === 'string' && notes.trim()
      ? encryptValue(notes.trim())
      : null;

    const author = req.user?.email || 'Usuario';
    const cleanTags = Array.isArray(tags) ? tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

    await query(
      `
      UPDATE vault_passwords
      SET 
        title = $1,
        category = $2,
        url = $3,
        username = $4,
        encrypted_password = $5,
        encrypted_additional_fields = $6,
        encrypted_notes = $7,
        is_favorite = $8,
        tags = $9,
        updated_by = $10,
        updated_at = NOW()
      WHERE id = $11;
    `,
      [
        title.trim(),
        (category || 'General').trim(),
        url ? url.trim() : null,
        username ? username.trim() : null,
        encryptedPassword,
        encryptedFields,
        encryptedNotes,
        Boolean(isFavorite),
        cleanTags,
        author,
        id,
      ]
    );

    await logAuditEvent({
      eventType: 'UPDATE_PASSWORD',
      targetType: 'PASSWORD',
      targetId: id,
      targetTitle: title.trim(),
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
    });

    res.status(200).json({ success: true, message: 'Credencial actualizada correctamente.' });
  } catch (err: any) {
    console.error('Error al actualizar credencial:', err);
    res.status(500).json({ error: 'Error al actualizar credencial.' });
  }
});

// DELETE /api/vault/passwords/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await query<{ title: string }>(
      'SELECT title FROM vault_passwords WHERE id = $1;',
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: 'Credencial no encontrada.' });
      return;
    }

    await query('DELETE FROM vault_passwords WHERE id = $1;', [id]);

    await logAuditEvent({
      eventType: 'DELETE_PASSWORD',
      targetType: 'PASSWORD',
      targetId: id,
      targetTitle: existing[0].title,
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
    });

    res.status(200).json({ success: true, message: 'Credencial eliminada exitosamente.' });
  } catch (err: any) {
    console.error('Error al eliminar credencial:', err);
    res.status(500).json({ error: 'Error al eliminar credencial.' });
  }
});

// POST /api/vault/passwords/:id/log-action (Auditar copiado de contraseña o usuario)
router.post('/:id/log-action', async (req, res) => {
  const { id } = req.params;
  const { action, fieldName } = req.body || {};

  try {
    const existing = await query<{ title: string }>('SELECT title FROM vault_passwords WHERE id = $1;', [id]);
    if (existing.length > 0) {
      await logAuditEvent({
        eventType: action === 'COPY' ? 'COPY_PASSWORD' : 'VIEW_PASSWORD',
        targetType: 'PASSWORD',
        targetId: id,
        targetTitle: existing[0].title,
        userEmail: req.user!.email,
        userName: req.user!.name,
        req,
        details: { field: fieldName || 'password' },
      });
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(200).json({ ok: true });
  }
});

export default router;

