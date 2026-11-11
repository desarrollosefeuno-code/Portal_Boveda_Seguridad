import { Router } from 'express';
import { query } from '../db/connection.js';
import { verifyPin, hashPin, generateSalt, createVaultSessionToken, verifyVaultSessionToken } from '../services/cryptoService.js';
import { logAuditEvent } from '../services/auditService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// GET /api/vault/status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const configRows = await query<{
      pin_hash: string;
      pin_salt: string;
      failed_attempts: number;
      locked_until: string | null;
    }>('SELECT pin_hash, pin_salt, failed_attempts, locked_until FROM vault_config WHERE id = 1;');

    const config = configRows[0];
    if (!config) {
      res.status(500).json({ error: 'Configuración de bóveda no inicializada.' });
      return;
    }

    let isLockedOut = false;
    let remainingCooldownMs = 0;

    if (config.locked_until) {
      const lockTime = new Date(config.locked_until).getTime();
      const now = Date.now();
      if (now < lockTime) {
        isLockedOut = true;
        remainingCooldownMs = lockTime - now;
      } else {
        // Cooldown expirado: resetear contador
        await query('UPDATE vault_config SET failed_attempts = 0, locked_until = NULL WHERE id = 1;');
        config.failed_attempts = 0;
      }
    }

    // Verificar si el token actual de sesión de bóveda es válido
    const vaultToken = req.headers['x-vault-token'] as string | undefined;
    const isUnlocked = vaultToken ? verifyVaultSessionToken(vaultToken).valid : false;

    // Verificar si sigue siendo el PIN por defecto ('1234')
    const isDefaultPin = await verifyPin('1234', config.pin_salt, config.pin_hash);

    res.status(200).json({
      unlocked: isUnlocked,
      isLockedOut,
      lockedUntil: isLockedOut ? config.locked_until : null,
      cooldownSeconds: Math.ceil(remainingCooldownMs / 1000),
      failedAttempts: config.failed_attempts,
      maxAttempts: MAX_ATTEMPTS,
      isDefaultPin,
    });
  } catch (err: any) {
    console.error('Error al consultar estado de la bóveda:', err);
    res.status(500).json({ error: 'Error al consultar estado de la bóveda.' });
  }
});

// POST /api/vault/unlock
router.post('/unlock', requireAuth, async (req, res) => {
  const { pin } = req.body || {};

  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'INVALID_PIN_FORMAT', message: 'El PIN debe ser un código numérico exacto de 4 dígitos.' });
    return;
  }

  try {
    const configRows = await query<{
      pin_hash: string;
      pin_salt: string;
      failed_attempts: number;
      locked_until: string | null;
    }>('SELECT pin_hash, pin_salt, failed_attempts, locked_until FROM vault_config WHERE id = 1 FOR UPDATE;');

    const config = configRows[0];
    if (!config) {
      res.status(500).json({ error: 'Configuración no encontrada.' });
      return;
    }

    // Verificar si está en bloqueo temporal
    if (config.locked_until) {
      const lockTime = new Date(config.locked_until).getTime();
      const now = Date.now();
      if (now < lockTime) {
        res.status(429).json({
          error: 'VAULT_LOCKOUT',
          message: `Bóveda temporalmente bloqueada por exceso de intentos fallidos. Intenta nuevamente a las ${new Date(config.locked_until).toLocaleTimeString('es-CL')}.`,
          lockedUntil: config.locked_until,
        });
        return;
      }
      // Resetear si expiró
      await query('UPDATE vault_config SET failed_attempts = 0, locked_until = NULL WHERE id = 1;');
      config.failed_attempts = 0;
    }

    const isMatch = await verifyPin(pin, config.pin_salt, config.pin_hash);

    if (!isMatch) {
      const newAttempts = config.failed_attempts + 1;
      let newLockUntil: string | null = null;

      if (newAttempts >= MAX_ATTEMPTS) {
        newLockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
        await query(
          'UPDATE vault_config SET failed_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = 1;',
          [newAttempts, newLockUntil]
        );

        await logAuditEvent({
          eventType: 'LOCKOUT_TRIGGERED',
          targetType: 'VAULT',
          userEmail: req.user!.email,
          userName: req.user!.name,
          req,
          details: { failedAttempts: newAttempts, lockedUntil: newLockUntil },
        });

        res.status(429).json({
          error: 'VAULT_LOCKOUT',
          message: `Se alcanzó el límite de ${MAX_ATTEMPTS} intentos fallidos. La bóveda ha sido bloqueada por ${LOCKOUT_MINUTES} minutos.`,
          lockedUntil: newLockUntil,
        });
        return;
      }

      await query('UPDATE vault_config SET failed_attempts = $1, updated_at = NOW() WHERE id = 1;', [newAttempts]);

      await logAuditEvent({
        eventType: 'UNLOCK_VAULT_FAILED',
        targetType: 'VAULT',
        userEmail: req.user!.email,
        userName: req.user!.name,
        req,
        details: { attempt: newAttempts, remaining: MAX_ATTEMPTS - newAttempts },
      });

      // NOTA CRÍTICA: Código 400 Bad Request, NUNCA 401 para no cerrar la sesión del usuario del portal
      res.status(400).json({
        error: 'INVALID_VAULT_PIN',
        message: `Clave PIN incorrecta. Te quedan ${MAX_ATTEMPTS - newAttempts} intento(s) antes del bloqueo.`,
        remainingAttempts: MAX_ATTEMPTS - newAttempts,
      });
      return;
    }

    // PIN correcto: Resetear intentos fallidos
    await query('UPDATE vault_config SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = 1;');

    const vaultToken = createVaultSessionToken(req.user!.id, req.user!.email, 900); // 15 minutos

    await logAuditEvent({
      eventType: 'UNLOCK_VAULT_SUCCESS',
      targetType: 'VAULT',
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
    });

    res.status(200).json({
      success: true,
      vaultToken,
      expiresInSeconds: 900,
      message: 'Bóveda desbloqueada exitosamente.',
    });
  } catch (err: any) {
    console.error('Error al desbloquear bóveda:', err);
    res.status(500).json({ error: 'Error interno al procesar el desbloqueo de la bóveda.' });
  }
});

// POST /api/vault/change-pin
router.post('/change-pin', requireAuth, async (req, res) => {
  const { currentPin, newPin } = req.body || {};

  if (!newPin || typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ error: 'El nuevo PIN debe ser un código numérico exacto de 4 dígitos.' });
    return;
  }

  try {
    const configRows = await query<{
      pin_hash: string;
      pin_salt: string;
    }>('SELECT pin_hash, pin_salt FROM vault_config WHERE id = 1;');
    const config = configRows[0];

    // Si el usuario no es admin, debe proporcionar el PIN actual obligatorio
    const isAdmin = req.user?.role === 'admin';
    if (!isAdmin || currentPin) {
      if (!currentPin) {
        res.status(400).json({ error: 'Debes ingresar el PIN actual de 4 dígitos para autorizar el cambio.' });
        return;
      }
      const isCurrentValid = await verifyPin(currentPin, config.pin_salt, config.pin_hash);
      if (!isCurrentValid) {
        res.status(400).json({ error: 'El PIN actual ingresado no es correcto.' });
        return;
      }
    }

    const newSalt = generateSalt();
    const newHash = await hashPin(newPin, newSalt);

    await query(
      'UPDATE vault_config SET pin_hash = $1, pin_salt = $2, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = 1;',
      [newHash, newSalt]
    );

    await logAuditEvent({
      eventType: 'CHANGE_PIN',
      targetType: 'VAULT',
      userEmail: req.user!.email,
      userName: req.user!.name,
      req,
      details: { changedByAdmin: isAdmin },
    });

    res.status(200).json({
      success: true,
      message: 'PIN de 4 dígitos actualizado exitosamente. Comunícalo verbalmente al equipo autorizado.',
    });
  } catch (err: any) {
    console.error('Error al cambiar PIN de la bóveda:', err);
    res.status(500).json({ error: 'Error al cambiar PIN de la bóveda.' });
  }
});

export default router;

