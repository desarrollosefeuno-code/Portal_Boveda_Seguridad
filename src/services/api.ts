import type {
  AdminRequest,
  AuditLogEntry,
  Environment,
  KeyInput,
  KeyMeta,
  KeySecret,
  ManagedUser,
  PasswordInput,
  PasswordMeta,
  PasswordSecret,
  RevealPurpose,
  SecretVersion,
  SessionUser,
  VaultStatus,
} from '../types/vault';

/**
 * Cliente del API. Las credenciales viajan solo en cookies HttpOnly: este código no guarda ni lee tokens
 * (antes el token de bóveda quedaba en sessionStorage, A-02). Toda petición que cambia datos lleva la
 * cabecera propia que el servidor exige como defensa CSRF.
 */

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public data?: Record<string, any>) {
    super(message);
  }
}

type Listener = (code: string) => void;
let onSessionLost: Listener | null = null;
let onVaultLocked: Listener | null = null;
let onVaultActivity: ((expiresAt: string) => void) | null = null;

export const apiEvents = {
  sessionLost: (cb: Listener) => (onSessionLost = cb),
  vaultLocked: (cb: Listener) => (onVaultLocked = cb),
  vaultActivity: (cb: (expiresAt: string) => void) => (onVaultActivity = cb),
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('X-F1-Vault', '1');

  let res: Response;
  try {
    res = await fetch(`/api${endpoint}`, { ...options, method, headers, credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError('No hay conexión con el servidor.', 0, 'NETWORK');
  }

  const expires = res.headers.get('X-Vault-Expires-At');
  if (expires) onVaultActivity?.(expires);

  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const code: string | undefined = data?.error;
    if (res.status === 401 && !endpoint.startsWith('/auth/login')) onSessionLost?.(code || 'UNAUTHORIZED');
    if (res.status === 403 && code?.startsWith('VAULT_')) onVaultLocked?.(code);
    throw new ApiError(data?.message || `Error HTTP ${res.status}`, res.status, code, data ?? undefined);
  }
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const id = (value: string) => encodeURIComponent(value);
type Ok = { success: boolean; message?: string };

function items<Meta, Secret, Input>(base: string) {
  return {
    list: () => request<{ items: Meta[] }>(base),
    trash: () => request<{ items: Meta[] }>(`${base}/trash`),
    reveal: (itemId: string, purpose: RevealPurpose) => request<Secret>(`${base}/${id(itemId)}/reveal?purpose=${purpose}`),
    create: (data: Input) => request<Ok & { id: string }>(base, json('POST', data)),
    update: (itemId: string, data: Input) => request<Ok & { version: number }>(`${base}/${id(itemId)}`, json('PUT', data)),
    favorite: (itemId: string, isFavorite: boolean) => request<Ok>(`${base}/${id(itemId)}/favorite`, json('PUT', { isFavorite })),
    remove: (itemId: string) => request<Ok>(`${base}/${id(itemId)}`, json('DELETE')),
    restore: (itemId: string) => request<Ok>(`${base}/${id(itemId)}/restore`, json('POST', {})),
    purge: (itemId: string) => request<Ok>(`${base}/${id(itemId)}/purge`, json('DELETE')),
    versions: (itemId: string) => request<{ items: SecretVersion[] }>(`${base}/${id(itemId)}/versions`),
    revealVersion: (versionId: string) => request<{ value: string }>(`${base}/versions/${id(versionId)}/reveal`),
  };
}

export type ItemsApi<Meta, Secret, Input> = ReturnType<typeof items<Meta, Secret, Input>>;

export const api = {
  auth: {
    login: (email: string, password: string) => request<{ user: SessionUser }>('/auth/login', json('POST', { email, password })),
    logout: () => request<Ok>('/auth/logout', json('POST', {})),
    me: () => request<{ user: SessionUser }>('/auth/me'),
    updateProfile: (name: string) => request<Ok>('/auth/profile', json('PUT', { name })),
    changePassword: (currentPassword: string, newPassword: string) => request<Ok>('/auth/change-password', json('POST', { currentPassword, newPassword })),
  },
  vault: {
    status: () => request<VaultStatus>('/vault/status'),
    setupPin: (password: string, newPin: string) => request<Ok & { expiresAt: string }>('/vault/pin/setup', json('POST', { password, newPin })),
    unlock: (pin: string) => request<Ok & { expiresAt: string }>('/vault/unlock', json('POST', { pin })),
    lock: () => request<Ok>('/vault/lock', json('POST', {})),
    changePin: (currentPin: string, newPin: string) => request<Ok & { expiresAt: string }>('/vault/change-pin', json('POST', { currentPin, newPin })),
  },
  passwords: items<PasswordMeta, PasswordSecret, PasswordInput>('/vault/passwords'),
  keys: items<KeyMeta, KeySecret, KeyInput>('/vault/keys'),
  audit: {
    list: (params: { page?: number; limit?: number; eventType?: string; targetType?: string; search?: string }) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
      return request<{ items: AuditLogEntry[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number }; scope: 'all' | 'own' }>(
        `/vault/audit?${q.toString()}`
      );
    },
  },
  users: {
    list: () => request<{ users: ManagedUser[] }>('/users'),
    create: (data: { email: string; name: string; temporaryPassword: string; keyEnvironments: Environment[] }) => request<Ok>('/users', json('POST', data)),
    update: (userId: string, data: { name: string; status: 'active' | 'disabled'; keyEnvironments: Environment[] }) => request<Ok>(`/users/${id(userId)}`, json('PUT', data)),
    resetPassword: (userId: string, temporaryPassword: string) => request<Ok>(`/users/${id(userId)}/reset-password`, json('POST', { temporaryPassword })),
    resetPin: (userId: string) => request<Ok>(`/users/${id(userId)}/reset-pin`, json('POST', {})),
    demote: (userId: string) => request<Ok>(`/users/${id(userId)}/demote`, json('POST', {})),
    remove: (userId: string) => request<Ok>(`/users/${id(userId)}`, json('DELETE')),
    requestAdmin: (userId: string) => request<Ok & { status: 'pending' | 'granted' }>(`/users/${id(userId)}/admin-request`, json('POST', {})),
    adminRequests: () => request<{ items: AdminRequest[] }>('/users/admin-requests'),
    approve: (requestId: string) => request<Ok>(`/users/admin-requests/${id(requestId)}/approve`, json('POST', {})),
    reject: (requestId: string) => request<Ok>(`/users/admin-requests/${id(requestId)}/reject`, json('POST', {})),
  },
};

export const errorMessage = (err: unknown, fallback = 'Ocurrió un error.') => (err instanceof Error && err.message ? err.message : fallback);
