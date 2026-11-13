export type Role = 'admin' | 'operator';
export type KeyType = 'API_KEY' | 'TOKEN' | 'SSH_KEY' | 'PIN_CODE' | 'DATABASE' | 'CERTIFICATE';
export type Environment = 'PROD' | 'STAGING' | 'QA' | 'DEV';
export type ActiveTab = 'PASSWORDS' | 'KEYS' | 'AUDIT' | 'USERS';
export type RevealPurpose = 'VIEW' | 'COPY' | 'EDIT';

export const ENVIRONMENTS: Environment[] = ['PROD', 'STAGING', 'QA', 'DEV'];

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  hasPin: boolean;
  mustChangePassword: boolean;
  keyEnvironments: Environment[];
}

export interface VaultAdditionalField {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

/** Metadatos comunes: el listado nunca trae secretos. */
interface ItemMeta {
  id: string;
  title: string;
  category: string;
  isFavorite: boolean;
  tags: string[];
  hasExtra: boolean;
  hasNotes: boolean;
  version: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

export interface PasswordMeta extends ItemMeta {
  url: string;
  username: string;
}

export interface PasswordSecret {
  password: string;
  additionalFields: VaultAdditionalField[];
  notes: string;
}

export interface KeyMeta extends ItemMeta {
  keyType: KeyType;
  environment: Environment;
  identifier: string;
  publicKey: string;
  expiresAt: string | null;
}

export interface KeySecret {
  secret: string;
  additionalData: Record<string, string>;
  notes: string;
}

export interface PasswordInput {
  title: string;
  category: string;
  url: string | null;
  username: string | null;
  password?: string;
  additionalFields: VaultAdditionalField[];
  notes: string | null;
  isFavorite: boolean;
  tags: string[];
  version?: number;
}

export interface KeyInput {
  title: string;
  keyType: KeyType;
  environment: Environment;
  category: string;
  identifier: string | null;
  secret?: string;
  publicKey: string | null;
  additionalData: Record<string, string>;
  notes: string | null;
  expiresAt: string | null;
  isFavorite: boolean;
  tags: string[];
  version?: number;
}

export interface SecretVersion {
  id: string;
  replacedBy: string;
  replacedAt: string;
}

export interface VaultStatus {
  hasPin: boolean;
  unlocked: boolean;
  expiresAt: string | null;
  isLockedOut: boolean;
  lockedUntil: string | null;
  remainingAttempts: number;
  maxAttempts: number;
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
  details: Record<string, unknown>;
  created_at: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
  mustChangePassword: boolean;
  hasPin: boolean;
  keyEnvironments: Environment[];
  locked: boolean;
}

export interface AdminRequest {
  id: string;
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  requestedBy: string | null;
  requestedByEmail: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedByEmail: string | null;
  createdAt: string;
  decidedAt: string | null;
}
