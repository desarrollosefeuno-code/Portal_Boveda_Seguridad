export interface VaultAdditionalField {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

export interface VaultPasswordEntry {
  id: string;
  title: string;
  category: string;
  url: string;
  username: string;
  password?: string;
  additionalFields: VaultAdditionalField[];
  notes: string;
  isFavorite: boolean;
  tags: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type KeyType = 'API_KEY' | 'TOKEN' | 'SSH_KEY' | 'PIN_CODE' | 'DATABASE' | 'CERTIFICATE';
export type Environment = 'PROD' | 'STAGING' | 'QA' | 'DEV';

export interface VaultKeyEntry {
  id: string;
  title: string;
  keyType: KeyType;
  environment: Environment;
  category: string;
  identifier: string;
  secret?: string;
  publicKey?: string;
  additionalData?: Record<string, any>;
  notes: string;
  expiresAt?: string | null;
  isFavorite: boolean;
  tags: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultStatus {
  unlocked: boolean;
  isLockedOut: boolean;
  lockedUntil: string | null;
  cooldownSeconds: number;
  failedAttempts: number;
  maxAttempts: number;
  isDefaultPin: boolean;
}

export interface AuditLogEntry {
  id: string;
  event_type: string;
  target_type: string | null;
  target_id: string | null;
  target_title: string | null;
  user_email: string;
  user_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, any>;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  status: 'active' | 'disabled';
  last_login_at: string | null;
  created_at: string;
}

export type ActiveTab = 'PASSWORDS' | 'KEYS' | 'AUDIT' | 'USERS';

