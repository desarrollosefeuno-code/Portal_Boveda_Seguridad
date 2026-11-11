import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar.js';
import { LoginView } from './components/LoginView.js';
import { VaultUnlockModal } from './components/VaultUnlockModal.js';
import { PasswordsView } from './components/PasswordsView.js';
import { KeysView } from './components/KeysView.js';
import { AuditLogView } from './components/AuditLogView.js';
import { UsersManagementView } from './components/UsersManagementView.js';
import { PasswordModal } from './components/PasswordModal.js';
import { KeyModal } from './components/KeyModal.js';
import { SecuritySettingsModal } from './components/SecuritySettingsModal.js';
import { ToastContainer, type ToastMessage } from './components/Toast.js';

import type {
  User,
  ActiveTab,
  VaultStatus,
  VaultPasswordEntry,
  VaultKeyEntry,
} from './types/vault.js';
import {
  api,
  getVaultSessionToken,
  setVaultSessionToken,
  onSessionExpired,
  onVaultLocked,
} from './services/api.js';

export function App() {
  // ── 1. Estado de Sesión del Usuario ──────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // ── 2. Estado de Bóveda y PIN ───────────────────────────────────────────
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);

  // ── 3. Navegación ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ActiveTab>('PASSWORDS');

  // ── 4. Datos de la Bóveda ───────────────────────────────────────────────
  const [passwords, setPasswords] = useState<VaultPasswordEntry[]>([]);
  const [keys, setKeys] = useState<VaultKeyEntry[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // ── 5. Modales ──────────────────────────────────────────────────────────
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editingPassword, setEditingPassword] = useState<VaultPasswordEntry | null>(null);

  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<VaultKeyEntry | null>(null);

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // ── 6. Toasts ────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Cargar Estado de Bóveda ─────────────────────────────────────────────
  const loadVaultStatus = useCallback(async () => {
    try {
      const status = await api.vault.getStatus();
      setVaultStatus(status);
      const hasToken = Boolean(getVaultSessionToken());
      setIsVaultUnlocked(hasToken && status.unlocked);
      if (!hasToken) {
        setIsVaultUnlocked(false);
      }
    } catch {
      // Ignorar si no está autenticado aún
    }
  }, []);

  // ── Cargar Datos Cifrados ────────────────────────────────────────────────
  const loadVaultData = useCallback(async () => {
    if (!isVaultUnlocked) return;
    try {
      setIsLoadingData(true);
      const [passRes, keysRes] = await Promise.all([
        api.passwords.list(),
        api.keys.list(),
      ]);
      setPasswords(passRes.items);
      setKeys(keysRes.items);
    } catch (err: any) {
      if (err?.code !== 'VAULT_LOCKED') {
        showToast('Error al cargar datos de la bóveda.', 'error');
      }
    } finally {
      setIsLoadingData(false);
    }
  }, [isVaultUnlocked]);

  // ── Verificar Sesión al Montar ──────────────────────────────────────────
  useEffect(() => {
    api.auth
      .me()
      .then((res) => {
        setCurrentUser(res.user);
        loadVaultStatus();
      })
      .catch(() => {
        setCurrentUser(null);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });

    onSessionExpired(() => {
      setCurrentUser(null);
      setIsVaultUnlocked(false);
      showToast('Tu sesión ha expirado. Por favor inicia sesión nuevamente.', 'warning');
    });

    onVaultLocked(() => {
      setIsVaultUnlocked(false);
      showToast('La bóveda se ha bloqueado por inactividad.', 'warning');
    });
  }, [loadVaultStatus]);

  // Cargar datos cuando se desbloquea la bóveda
  useEffect(() => {
    if (isVaultUnlocked) {
      loadVaultData();
    }
  }, [isVaultUnlocked, loadVaultData]);

  // Bloqueo de Bóveda
  const handleLockVault = () => {
    setVaultSessionToken(null);
    setIsVaultUnlocked(false);
    setPasswords([]);
    setKeys([]);
    showToast('Bóveda bloqueada exitosamente.', 'info');
    loadVaultStatus();
  };

  // Desbloqueo exitoso desde el Modal
  const handleUnlocked = () => {
    setIsVaultUnlocked(true);
    loadVaultStatus();
  };

  // Cierre de Sesión General
  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } finally {
      setCurrentUser(null);
      setVaultSessionToken(null);
      setIsVaultUnlocked(false);
      showToast('Sesión cerrada.', 'info');
    }
  };

  // ── Handlers de Contraseñas de Portales ──────────────────────────────────
  const handleSavePassword = async (data: Partial<VaultPasswordEntry>) => {
    if (editingPassword) {
      await api.passwords.update(editingPassword.id, data);
      showToast('Credencial de portal actualizada.', 'success');
    } else {
      await api.passwords.create(data);
      showToast('Nueva credencial de portal creada y cifrada.', 'success');
    }
    await loadVaultData();
  };

  const handleDeletePassword = async (entry: VaultPasswordEntry) => {
    if (!confirm(`¿Estás seguro de eliminar la credencial "${entry.title}"?`)) return;
    try {
      await api.passwords.delete(entry.id);
      showToast(`Credencial "${entry.title}" eliminada.`, 'success');
      await loadVaultData();
    } catch {
      showToast('Error al eliminar credencial.', 'error');
    }
  };

  // ── Handlers de Llaves y Tokens ──────────────────────────────────────────
  const handleSaveKey = async (data: Partial<VaultKeyEntry>) => {
    if (editingKey) {
      await api.keys.update(editingKey.id, data);
      showToast('Llave / Token actualizado correctamente.', 'success');
    } else {
      await api.keys.create(data);
      showToast('Nueva llave / token registrado y cifrado.', 'success');
    }
    await loadVaultData();
  };

  const handleDeleteKey = async (entry: VaultKeyEntry) => {
    if (!confirm(`¿Estás seguro de eliminar la llave "${entry.title}"?`)) return;
    try {
      await api.keys.delete(entry.id);
      showToast(`Llave "${entry.title}" eliminada.`, 'success');
      await loadVaultData();
    } catch {
      showToast('Error al eliminar llave.', 'error');
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs font-mono">
        Iniciando entorno de alta seguridad...
      </div>
    );
  }

  // Si no ha iniciado sesión de usuario
  if (!currentUser) {
    return (
      <>
        <LoginView
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            loadVaultStatus();
          }}
          showToast={showToast}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  // Usuario autenticado en el portal
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        currentUser={currentUser}
        vaultStatus={vaultStatus}
        isVaultUnlocked={isVaultUnlocked}
        onLockVault={handleLockVault}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isVaultUnlocked ? (
          <VaultUnlockModal
            vaultStatus={vaultStatus}
            onUnlocked={handleUnlocked}
            onRefreshStatus={loadVaultStatus}
            showToast={showToast}
            isAdmin={currentUser.role === 'admin'}
          />
        ) : (
          <>
            {activeTab === 'PASSWORDS' && (
              <PasswordsView
                entries={passwords}
                onRefresh={loadVaultData}
                onOpenCreate={() => {
                  setEditingPassword(null);
                  setIsPasswordModalOpen(true);
                }}
                onOpenEdit={(p) => {
                  setEditingPassword(p);
                  setIsPasswordModalOpen(true);
                }}
                onDelete={handleDeletePassword}
                showToast={showToast}
                userEmail={currentUser.email}
              />
            )}

            {activeTab === 'KEYS' && (
              <KeysView
                entries={keys}
                onRefresh={loadVaultData}
                onOpenCreate={() => {
                  setEditingKey(null);
                  setIsKeyModalOpen(true);
                }}
                onOpenEdit={(k) => {
                  setEditingKey(k);
                  setIsKeyModalOpen(true);
                }}
                onDelete={handleDeleteKey}
                showToast={showToast}
                userEmail={currentUser.email}
              />
            )}

            {activeTab === 'AUDIT' && <AuditLogView showToast={showToast} />}

            {activeTab === 'USERS' && currentUser.role === 'admin' && (
              <UsersManagementView currentUserId={currentUser.id} showToast={showToast} />
            )}
          </>
        )}
      </main>

      {/* Footer de Seguridad */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>F1 KeyVault & Fortress • Portal de Bóveda Ultra-Segura v1.0.0</span>
          <span>Cifrado Militar AES-256-GCM • Despliegue en Railway</span>
        </div>
      </footer>

      {/* Modales */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        onSave={handleSavePassword}
        editingEntry={editingPassword}
        categories={Array.from(new Set(passwords.map((p) => p.category)))}
      />

      <KeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onSave={handleSaveKey}
        editingEntry={editingKey}
      />

      <SecuritySettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        vaultStatus={vaultStatus}
        onPinChanged={loadVaultStatus}
        showToast={showToast}
        isAdmin={currentUser.role === 'admin'}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;

