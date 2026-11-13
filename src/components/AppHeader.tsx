import { useEffect, useState } from 'react';
import { History, KeyRound, Lock, LogOut, ShieldCheck, Terminal, UserCog, UserRound, Users } from 'lucide-react';
import { Button, cn, IconButton } from './f1-ui';
import type { ActiveTab, SessionUser } from '../types/vault';

const TABS: Array<{ id: ActiveTab; label: string; short: string; icon: React.ElementType; admin?: boolean }> = [
  { id: 'PASSWORDS', label: 'Contraseñas', short: 'Claves', icon: KeyRound },
  { id: 'KEYS', label: 'Llaves y tokens', short: 'Llaves', icon: Terminal },
  { id: 'AUDIT', label: 'Bitácora', short: 'Bitácora', icon: History },
  { id: 'USERS', label: 'Usuarios', short: 'Usuarios', icon: Users, admin: true },
];

function useRemaining(expiresAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const s = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Cabecera fija (no desaparece al hacer scroll) y barra inferior de navegación en el celular. */
export function AppHeader({ user, tab, onTab, unlocked, vaultExpiresAt, onLock, onAccount, onLogout }: {
  user: SessionUser;
  tab: ActiveTab;
  onTab: (tab: ActiveTab) => void;
  unlocked: boolean;
  vaultExpiresAt: string | null;
  onLock: () => void;
  onAccount: () => void;
  onLogout: () => void;
}) {
  const remaining = useRemaining(unlocked ? vaultExpiresAt : null);
  const tabs = TABS.filter((t) => !t.admin || user.role === 'admin');

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-header/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand-line">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="matrix-glow truncate text-sm font-bold text-brand">F1 KeyVault</p>
              <p className="hidden truncate text-[11px] text-fg-3 sm:block">bóveda://f1-plus</p>
            </div>
          </div>

          {unlocked && (
            <nav aria-label="Secciones" className="ml-4 hidden items-center gap-1 rounded-xl border border-line bg-surface-2 p-1 md:flex">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTab(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors',
                    tab === t.id ? 'bg-brand-soft text-brand ring-1 ring-brand-line' : 'text-fg-2 hover:bg-hover hover:text-fg'
                  )}
                >
                  <t.icon size={16} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {unlocked && (
              <>
                {remaining && (
                  <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs tabular-nums text-fg-2 sm:flex" title="Se bloquea tras 15 minutos sin actividad">
                    <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                    <span className="sr-only">La bóveda se bloquea en</span>
                    {remaining}
                  </span>
                )}
                <Button variant="secondary" size="sm" icon={Lock} onClick={onLock}>
                  <span className="hidden sm:inline">Bloquear</span>
                  <span className="sr-only sm:hidden">Bloquear bóveda</span>
                </Button>
              </>
            )}
            <div className="hidden items-center gap-2 border-l border-line pl-3 lg:flex">
              <span className="text-right leading-tight">
                <span className="block max-w-44 truncate text-xs font-semibold text-fg">{user.name}</span>
                <span className="block text-[11px] text-fg-3">{user.role === 'admin' ? 'Administrador' : 'Operador'}</span>
              </span>
            </div>
            <IconButton label="Mi cuenta" icon={user.role === 'admin' ? UserCog : UserRound} onClick={onAccount} tipSide="bottom" />
            <IconButton label="Cerrar sesión" icon={LogOut} tone="danger" onClick={onLogout} tipSide="bottom" />
          </div>
        </div>
      </header>

      {unlocked && (
        <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-header/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', tab === t.id ? 'text-brand' : 'text-fg-3')}
            >
              <t.icon size={20} aria-hidden="true" />
              {t.short}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
