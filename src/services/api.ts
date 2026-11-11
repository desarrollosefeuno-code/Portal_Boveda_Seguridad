import type {
  VaultPasswordEntry,
  VaultKeyEntry,
  VaultStatus,
  AuditLogEntry,
  User,
} from '../types/vault.js';

let inMemoryVaultToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let vaultLockedHandler: (() => void) | null = null;

export function setVaultSessionToken(token: string | null) {
  inMemoryVaultToken = token;
  if (token) {
    sessionStorage.setItem('f1_vault_session_token', token);
  } else {
    sessionStorage.removeItem('f1_vault_session_token');
  }
}

export function getVaultSessionToken(): string | null {
  if (!inMemoryVaultToken) {
    inMemoryVaultToken = sessionStorage.getItem('f1_vault_session_token');
  }
  return inMemoryVaultToken;
}

export function onSessionExpired(cb: () => void) {
  sessionExpiredHandler = cb;
}

export function onVaultLocked(cb: () => void) {
  vaultLockedHandler = cb;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const vaultToken = getVaultSessionToken();
  if (vaultToken) {
    headers.set('x-vault-token', vaultToken);
  }

  const res = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Para cookies HttpOnly
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    // Si la sesión del portal expiró (401), notificar a la app
    if (res.status === 401 && !endpoint.startsWith('/auth/login')) {
      if (sessionExpiredHandler) sessionExpiredHandler();
    }

    // Si la bóveda está bloqueada o el token de bóveda expiró (403), bloquear bóveda sin cerrar sesión del usuario
    if (res.status === 403 && data?.error?.includes('VAULT_')) {
      setVaultSessionToken(null);
      if (vaultLockedHandler) vaultLockedHandler();
    }

    const errorMsg = data?.message || data?.error || `Error HTTP ${res.status}`;
    const err = new Error(errorMsg) as any;
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }

  return data as T;
}

export const api = {
  auth: {
    login: (credentials: { email: string; password: string }) =>
      request<{ success: boolean; user: User; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      }),
    logout: () => {
      setVaultSessionToken(null);
      return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
    },
    me: () => request<{ user: User }>('/auth/me'),
    updateProfile: (data: { name?: string; currentPassword?: string; newPassword?: string }) =>
      request<{ success: boolean; message: string }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },

  vault: {
    getStatus: () => request<VaultStatus>('/vault/status'),
    unlock: (pin: string) =>
      request<{ success: boolean; vaultToken: string; expiresInSeconds: number }>('/vault/unlock', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      }),
    changePin: (data: { currentPin?: string; newPin: string }) =>
      request<{ success: boolean; message: string }>('/vault/change-pin', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  passwords: {
    list: () => request<{ items: VaultPasswordEntry[] }>('/vault/passwords'),
    create: (data: Partial<VaultPasswordEntry>) =>
      request<{ success: boolean; id: string; message: string }>('/vault/passwords', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<VaultPasswordEntry>) =>
      request<{ success: boolean; message: string }>(`/vault/passwords/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/vault/passwords/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    logAction: (id: string, action: 'VIEW' | 'COPY', fieldName?: string) =>
      request<{ ok: boolean }>(`/vault/passwords/${encodeURIComponent(id)}/log-action`, {
        method: 'POST',
        body: JSON.stringify({ action, fieldName }),
      }),
  },

  keys: {
    list: () => request<{ items: VaultKeyEntry[] }>('/vault/keys'),
    create: (data: Partial<VaultKeyEntry>) =>
      request<{ success: boolean; id: string; message: string }>('/vault/keys', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<VaultKeyEntry>) =>
      request<{ success: boolean; message: string }>(`/vault/keys/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/vault/keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    logAction: (id: string, action: 'VIEW' | 'COPY', fieldName?: string) =>
      request<{ ok: boolean }>(`/vault/keys/${encodeURIComponent(id)}/log-action`, {
        method: 'POST',
        body: JSON.stringify({ action, fieldName }),
      }),
  },

  audit: {
    getLogs: (params: { page?: number; limit?: number; eventType?: string; targetType?: string; search?: string }) => {
      const q = new URLSearchParams();
      if (params.page) q.set('page', String(params.page));
      if (params.limit) q.set('limit', String(params.limit));
      if (params.eventType) q.set('eventType', params.eventType);
      if (params.targetType) q.set('targetType', params.targetType);
      if (params.search) q.set('search', params.search);
      return request<{ items: AuditLogEntry[]; pagination: { page: number; limit: number; totalCount: number; totalPages: number } }>(
        `/vault/audit?${q.toString()}`
      );
    },
  },

  users: {
    list: () => request<{ users: User[] }>('/users'),
    create: (data: { email: string; name: string; password: string; role: 'admin' | 'operator' }) =>
      request<{ success: boolean; message: string }>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name: string; role: 'admin' | 'operator'; status: 'active' | 'disabled'; newPassword?: string }) =>
      request<{ success: boolean; message: string }>(`/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message: string }>(`/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
};
