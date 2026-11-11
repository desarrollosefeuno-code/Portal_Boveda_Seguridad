import React, { useState } from 'react';
import {
  X,
  KeyRound,
  ShieldCheck,
  Lock,
  AlertTriangle,
  User,
  Key,
  CheckCircle2,
} from 'lucide-react';
import type { VaultStatus } from '../types/vault.js';
import { api } from '../services/api.js';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultStatus: VaultStatus | null;
  onPinChanged: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isAdmin: boolean;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  vaultStatus,
  onPinChanged,
  showToast,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'PIN' | 'USER_PASS'>('PIN');

  // Estado cambio PIN
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Estado cambio Contraseña propia
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmNewPass, setConfirmNewPass] = useState('');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPin || !/^\d{4}$/.test(newPin)) {
      setPinError('El nuevo PIN debe ser de 4 dígitos numéricos exactos.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError('La confirmación del nuevo PIN no coincide.');
      return;
    }

    try {
      setIsChangingPin(true);
      setPinError(null);
      await api.vault.changePin({
        currentPin: currentPin.trim() || undefined,
        newPin: newPin.trim(),
      });
      showToast('PIN de 4 dígitos actualizado exitosamente.', 'success');
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      onPinChanged();
      onClose();
    } catch (err: any) {
      setPinError(err?.message || 'Error al cambiar PIN.');
    } finally {
      setIsChangingPin(false);
    }
  };

  const handleChangePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPass) {
      setPassError('Ingresa tu contraseña actual.');
      return;
    }
    if (newPass.length < 8) {
      setPassError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPass !== confirmNewPass) {
      setPassError('La confirmación de la contraseña no coincide.');
      return;
    }

    try {
      setIsChangingPass(true);
      setPassError(null);
      await api.auth.updateProfile({
        currentPassword: currentPass,
        newPassword: newPass,
      });
      showToast('Tu contraseña ha sido actualizada exitosamente.', 'success');
      setCurrentPass('');
      setNewPass('');
      setConfirmNewPass('');
      onClose();
    } catch (err: any) {
      setPassError(err?.message || 'Error al cambiar contraseña.');
    } finally {
      setIsChangingPass(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">Ajustes de Seguridad</h3>
              <p className="text-xs text-slate-400">PIN de Bóveda y Contraseña de Usuario</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de Pestaña */}
        <div className="flex border-b border-slate-800 text-xs font-bold text-center">
          <button
            type="button"
            onClick={() => setActiveTab('PIN')}
            className={`flex-1 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'PIN'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-850/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>PIN Maestro de 4 Dígitos</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('USER_PASS')}
            className={`flex-1 py-3 transition-colors flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'USER_PASS'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-850/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Mi Contraseña</span>
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {activeTab === 'PIN' ? (
            <form onSubmit={handleChangePin} className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Este código de 4 dígitos protege el acceso a todas las contraseñas, llaves y tokens. Se comparte verbalmente entre usuarios autorizados.
              </p>

              {vaultStatus?.isDefaultPin && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>El PIN actual sigue siendo el valor por defecto (1234). Cámbialo ahora.</span>
                </div>
              )}

              {pinError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                  {pinError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  PIN Actual (4 dígitos)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required={!isAdmin}
                  placeholder="Ej: 1234"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500 text-center tracking-widest font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Nuevo PIN (4 dígitos)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    placeholder="4 dígitos..."
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500 text-center tracking-widest font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Confirmar PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    placeholder="Repite PIN..."
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500 text-center tracking-widest font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isChangingPin || newPin.length !== 4}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isChangingPin ? 'Actualizando PIN...' : 'Confirmar y Cambiar PIN'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleChangePass} className="space-y-4">
              <p className="text-xs text-slate-400 leading-relaxed">
                Actualiza la contraseña con la que inicias sesión en el portal.
              </p>

              {passError && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                  {passError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Contraseña Actual
                </label>
                <input
                  type="password"
                  required
                  placeholder="Tu contraseña actual..."
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Nueva Contraseña (mínimo 8 caracteres)
                </label>
                <input
                  type="password"
                  required
                  placeholder="Nueva contraseña segura..."
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repite la nueva contraseña..."
                  value={confirmNewPass}
                  onChange={(e) => setConfirmNewPass(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isChangingPass}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isChangingPass ? 'Actualizando...' : 'Actualizar Mi Contraseña'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

