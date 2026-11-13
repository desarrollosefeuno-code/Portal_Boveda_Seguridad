import { useCallback, useEffect, useRef, useState } from 'react';
import { F1LoadingScreen, useToast } from './components/f1-ui';
import { AppHeader } from './components/AppHeader';
import { LoginView } from './components/LoginView';
import { VaultGate } from './components/VaultGate';
import { AccountModal, ForcedPasswordChange } from './components/AccountPanels';
import { PasswordsView } from './components/PasswordsView';
import { KeysView } from './components/KeysView';
import { AuditLogView } from './components/AuditLogView';
import { UsersManagementView } from './components/UsersManagementView';
import { MatrixRain, readRainPreference, saveRainPreference } from './components/MatrixRain';
import { api, apiEvents } from './services/api';
import type { ActiveTab, SessionUser, VaultStatus } from './types/vault';

/** Inactividad en el navegador: a los 15 min sin tocar nada se bloquea la bóveda (el servidor también lo hace). */
const IDLE_MS = 15 * 60 * 1000;

function useIdle(active: boolean, onIdle: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    if (!active) return;
    const reset = () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => cb.current(), IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active]);
}

export function App() {
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [vaultExpiresAt, setVaultExpiresAt] = useState<string | null>(null);
  const [tab, setTab] = useState<ActiveTab>('PASSWORDS');
  const [accountOpen, setAccountOpen] = useState(false);
  const [rain, setRain] = useState(readRainPreference);

  const unlocked = Boolean(status?.unlocked);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.vault.status();
      setStatus(s);
      setVaultExpiresAt(s.expiresAt);
    } catch {
      /* 401/403 se manejan en los eventos del API */
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: u } = await api.auth.me();
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser()
      .then((u) => (u && !u.mustChangePassword ? refreshStatus() : undefined))
      .finally(() => setChecking(false));
  }, [refreshUser, refreshStatus]);

  const userRef = useRef<SessionUser | null>(null);
  userRef.current = user;

  useEffect(() => {
    apiEvents.sessionLost(() => {
      // Solo avisa si había una sesión abierta (no al abrir la página sin sesión)
      if (userRef.current) toast.info('Tu sesión terminó. Inicia sesión nuevamente.');
      setUser(null);
      setStatus(null);
    });
    apiEvents.vaultLocked(() => {
      setStatus((s) => (s ? { ...s, unlocked: false, expiresAt: null } : s));
      setVaultExpiresAt(null);
      refreshStatus();
    });
    apiEvents.vaultActivity(setVaultExpiresAt);
  }, [toast, refreshStatus]);

  // Bloqueo automático cuando vence la caducidad del servidor aunque no haya peticiones
  useEffect(() => {
    if (!unlocked || !vaultExpiresAt) return;
    const ms = new Date(vaultExpiresAt).getTime() - Date.now();
    const t = window.setTimeout(() => {
      setStatus((s) => (s ? { ...s, unlocked: false } : s));
      toast.info('La bóveda se bloqueó por inactividad.');
      refreshStatus();
    }, Math.max(0, ms) + 500);
    return () => window.clearTimeout(t);
  }, [unlocked, vaultExpiresAt, toast, refreshStatus]);

  const lock = useCallback(async () => {
    try {
      await api.vault.lock();
    } finally {
      setStatus((s) => (s ? { ...s, unlocked: false, expiresAt: null } : s));
      setVaultExpiresAt(null);
      refreshStatus();
    }
  }, [refreshStatus]);

  useIdle(unlocked, () => {
    lock();
    toast.info('La bóveda se bloqueó tras 15 minutos sin actividad.');
  });

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      /* aunque falle, se limpia la pantalla */
    }
    setUser(null);
    setStatus(null);
    setAccountOpen(false);
  };

  const changeRain = (on: boolean) => {
    setRain(on);
    saveRainPreference(on);
  };

  if (checking) return <F1LoadingScreen text="Iniciando la bóveda…" subtext="Verificando la sesión segura" />;

  if (!user) {
    return (
      <>
        <MatrixRain enabled={rain} intensity="high" />
        <div className="matrix-scanlines" aria-hidden="true" />
        <LoginView
          onLogin={(u) => {
            setUser(u);
            setTab('PASSWORDS');
            if (!u.mustChangePassword) refreshStatus();
          }}
        />
      </>
    );
  }

  return (
    <div className="relative min-h-dvh">
      <MatrixRain enabled={rain} intensity={unlocked ? 'low' : 'high'} />
      <div className="matrix-scanlines" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <AppHeader
          user={user}
          tab={tab}
          onTab={setTab}
          unlocked={unlocked}
          vaultExpiresAt={vaultExpiresAt}
          onLock={lock}
          onAccount={() => setAccountOpen(true)}
          onLogout={logout}
        />

        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10">
          {user.mustChangePassword ? (
            <ForcedPasswordChange
              user={user}
              onLogout={logout}
              onDone={async () => {
                const u = await refreshUser();
                if (u) refreshStatus();
              }}
            />
          ) : !unlocked ? (
            <VaultGate
              status={status}
              onRefresh={refreshStatus}
              onUnlocked={async () => {
                await refreshStatus();
                refreshUser();
                toast.success('Bóveda desbloqueada.');
              }}
            />
          ) : (
            <>
              {tab === 'PASSWORDS' && <PasswordsView isAdmin={user.role === 'admin'} />}
              {tab === 'KEYS' && <KeysView user={user} />}
              {tab === 'AUDIT' && <AuditLogView />}
              {tab === 'USERS' && user.role === 'admin' && <UsersManagementView currentUserId={user.id} />}
            </>
          )}
        </main>

        <footer className="hidden border-t border-line bg-header/80 py-3 text-center text-[11px] text-fg-3 md:block">
          F1 KeyVault v2.0.0 · AES-256-GCM · cada revelación de un secreto queda en la bitácora
        </footer>
      </div>

      <AccountModal
        key={user.id + user.name}
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        user={user}
        onUserChanged={refreshUser}
        vaultUnlocked={unlocked}
        rain={rain}
        onRainChange={changeRain}
      />
    </div>
  );
}
