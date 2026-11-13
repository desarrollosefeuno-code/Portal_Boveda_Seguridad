import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';

/** Esquemas de entrada (M-01). Todo lo que llega del cliente pasa por aquí antes de tocar la BD. */
z.config(z.locales.es());

export const KEY_TYPES = ['API_KEY', 'TOKEN', 'SSH_KEY', 'DATABASE', 'PIN_CODE', 'CERTIFICATE'] as const;
export const ENVIRONMENTS = ['PROD', 'STAGING', 'QA', 'DEV'] as const;

const text = (max: number) => z.string().trim().max(max);
const required = (label: string, max: number) => z.string({ error: `${label} es obligatorio.` }).trim().min(1, `${label} es obligatorio.`).max(max, `${label} admite hasta ${max} caracteres.`);
const optionalText = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));

export const idParam = z.object({ id: z.uuid({ error: 'Identificador no válido.' }) });
export const versionParam = z.object({ versionId: z.uuid({ error: 'Identificador no válido.' }) });
export const requestParam = z.object({ rid: z.uuid({ error: 'Identificador no válido.' }) });

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ error: 'Correo electrónico no válido.' }).max(254));

/** Política de contraseñas: largo (NIST 800-63B), sin las claves publicadas ni el propio correo. */
export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria.' })
  .min(12, 'La contraseña debe tener al menos 12 caracteres.')
  .max(128, 'La contraseña admite hasta 128 caracteres.')
  .refine((v) => v.trim().length === v.length, 'La contraseña no puede empezar ni terminar con espacios.')
  .refine((v) => new Set(v).size >= 6, 'La contraseña es demasiado repetitiva.');

export const pinSchema = z.string({ error: 'El PIN es obligatorio.' }).regex(/^\d{6}$/, 'El PIN debe tener exactamente 6 dígitos.');

const tags = z.array(text(40).min(1)).max(20, 'Máximo 20 etiquetas.').default([]).transform((list) => [...new Set(list)]);
const version = z.number().int().positive();

const additionalField = z.object({
  id: text(64).min(1),
  key: required('El nombre del campo', 100),
  value: z.string().max(5000, 'Un dato adicional admite hasta 5.000 caracteres.'),
  isSecret: z.boolean().default(false),
});

const url = optionalText(2048).refine((v) => !v || !/^\s*(javascript|data|vbscript|file):/i.test(v), 'La URL debe ser http o https.');

const passwordBase = {
  title: required('El título', 200),
  category: text(80).optional().transform((v) => v || 'General'),
  url,
  username: optionalText(320),
  additionalFields: z.array(additionalField).max(50, 'Máximo 50 datos adicionales.').optional(),
  notes: z.string().max(20000, 'Las notas admiten hasta 20.000 caracteres.').optional().nullable(),
  isFavorite: z.boolean().default(false),
  tags,
};

export const passwordCreateSchema = z.object({
  ...passwordBase,
  password: z.string({ error: 'La contraseña es obligatoria.' }).min(1, 'La contraseña es obligatoria.').max(10000),
});

export const passwordUpdateSchema = z.object({
  ...passwordBase,
  /** Si se omite, se conserva el valor actual. */
  password: z.string().min(1).max(10000).optional(),
  version,
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato aaaa-mm-dd.')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha no válida.');

const keyBase = {
  title: required('El nombre', 200),
  keyType: z.enum(KEY_TYPES).default('API_KEY'),
  environment: z.enum(ENVIRONMENTS).default('PROD'),
  category: text(80).optional().transform((v) => v || 'General'),
  identifier: optionalText(500),
  publicKey: z.string().max(50000).optional().nullable().transform((v) => (v?.trim() ? v.trim() : null)),
  additionalData: z.record(text(100), z.string().max(5000)).optional().refine((v) => !v || Object.keys(v).length <= 50, 'Máximo 50 datos adicionales.'),
  notes: z.string().max(20000, 'Las notas admiten hasta 20.000 caracteres.').optional().nullable(),
  expiresAt: isoDate.optional().nullable().transform((v) => v || null),
  isFavorite: z.boolean().default(false),
  tags,
};

export const keyCreateSchema = z.object({
  ...keyBase,
  secret: z.string({ error: 'El secreto es obligatorio.' }).min(1, 'El secreto es obligatorio.').max(50000),
});

export const keyUpdateSchema = z.object({
  ...keyBase,
  secret: z.string().min(1).max(50000).optional(),
  version,
});

export const revealQuery = z.object({ purpose: z.enum(['VIEW', 'COPY', 'EDIT']).default('VIEW') });

export const auditQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(10).max(100).default(50),
  eventType: z.string().regex(/^[A-Z_]{1,40}$/).optional(),
  targetType: z.enum(['PASSWORD', 'KEY', 'VAULT', 'USER', 'AUTH', 'ALL']).optional(),
  search: text(100).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(128),
});

export const changePasswordSchema = z.object({ currentPassword: z.string().max(128), newPassword: passwordSchema });
export const profileSchema = z.object({ name: required('El nombre', 120) });
export const pinSetupSchema = z.object({ password: z.string().max(128), newPin: pinSchema });
export const pinUnlockSchema = z.object({ pin: pinSchema });
export const pinChangeSchema = z.object({ currentPin: pinSchema, newPin: pinSchema });

const environments = z.array(z.enum(ENVIRONMENTS)).max(4).transform((list) => [...new Set(list)]);

export const userCreateSchema = z.object({
  email: emailSchema,
  name: required('El nombre', 120),
  temporaryPassword: passwordSchema,
  keyEnvironments: environments.default([...ENVIRONMENTS]),
});

export const userUpdateSchema = z.object({
  name: required('El nombre', 120),
  status: z.enum(['active', 'disabled']),
  keyEnvironments: environments,
});

export const resetPasswordSchema = z.object({ temporaryPassword: passwordSchema });

/** Errores que el manejador central traduce a una respuesta 4xx. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const parse = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T> => {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, 'VALIDATION_ERROR', issue?.message || 'Datos no válidos.', {
      field: issue?.path.join('.') || undefined,
    });
  }
  return result.data;
};

/** Envuelve un manejador asíncrono para que los errores lleguen al manejador central. */
export const handler =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
