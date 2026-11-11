import React from 'react';
import {
  Shield,
  KeyRound,
  FileCode2,
  History,
  Users,
  Lock,
  LogOut,
  Settings,
  Sparkles,
} from 'lucide-react';
import type { ActiveTab, User, VaultStatus } from '../types/vault.js';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentUser: User | null;
  vaultStatus: VaultStatus | null;
  isVaultUnlocked: boolean;
  onLockVault: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  currentUser,
  isVaultUnlocked,
  onLockVault,
  onOpenSettings,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo y Marca */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-base tracking-tight font-display">
                  F1 KeyVault
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                  Fortress
                </span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5 font-medium">Bóveda Ultra-Segura</p>
            </div>
          </div>

          {/* Selector de Pestañas / Módulos Principales */}
          {isVaultUnlocked && (
            <nav className="hidden md:flex items-center p-1 rounded-2xl bg-slate-900 border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => onTabChange('PASSWORDS')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'PASSWORDS'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Contraseñas de Portales</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('KEYS')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'KEYS'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <FileCode2 className="w-4 h-4" />
                <span>Llaves y Tokens</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('AUDIT')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'AUDIT'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <History className="w-4 h-4" />
                <span>Bitácora</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => onTabChange('USERS')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                    activeTab === 'USERS'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Usuarios</span>
                </button>
              )}
            </nav>
          )}

          {/* Acciones de Seguridad y Perfil */}
          <div className="flex items-center gap-2.5">
            {isVaultUnlocked ? (
              <>
                <button
                  type="button"
                  onClick={onLockVault}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all cursor-pointer"
                  title="Bloquear bóveda inmediatamente"
                >
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">Bloquear Bóveda</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                  title="Ajustes de Seguridad y PIN"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>Bóveda Bloqueada</span>
              </div>
            )}

            {/* Usuario Actual */}
            <div className="hidden lg:flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <div className="text-right">
                <span className="block text-xs font-bold text-white truncate max-w-[130px]">
                  {currentUser?.name || 'Usuario'}
                </span>
                <span className="block text-[10px] uppercase font-bold tracking-wider text-indigo-400">
                  {currentUser?.role === 'admin' ? 'Administrador' : 'Operador'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barra Móvil de Pestañas */}
        {isVaultUnlocked && (
          <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800/60 overflow-x-auto text-[11px] font-semibold gap-1">
            <button
              type="button"
              onClick={() => onTabChange('PASSWORDS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'PASSWORDS' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Contraseñas</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('KEYS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'KEYS' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Llaves & Tokens</span>
            </button>

            <button
              type="button"
              onClick={() => onTabChange('AUDIT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap ${
                activeTab === 'AUDIT' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Bitácora</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => onTabChange('USERS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap ${
                  activeTab === 'USERS' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Usuarios</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
