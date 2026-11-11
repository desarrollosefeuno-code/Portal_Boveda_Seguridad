import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, KeyRound, Eye, EyeOff, AlertTriangle, RefreshCw, Delete } from 'lucide-react';
import type { VaultStatus } from '../types/vault.js';
import { api, setVaultSessionToken } from '../services/api.js';

interface VaultUnlockModalProps {
  vaultStatus: VaultStatus | null;
  onUnlocked: () => void;
  onRefreshStatus: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isAdmin: boolean;
}

export const VaultUnlockModal: React.FC<VaultUnlockModalProps> = ({
  vaultStatus,
  onUnlocked,
  onRefreshStatus,
  showToast,
  isAdmin,
}) => {
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '']);
  const [showPinDigits, setShowPinDigits] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const digitRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  useEffect(() => {
    // Foco en la primera casilla al montar
    if (!vaultStatus?.isLockedOut) {
      setTimeout(() => {
        digitRefs[0].current?.focus();
      }, 100);
    }
  }, [vaultStatus?.isLockedOut]);

  const handleVerifyPin = async (fullPin: string) => {
    if (fullPin.length !== 4) return;
    try {
      setIsVerifying(true);
      setErrorMessage(null);
      const res = await api.vault.unlock(fullPin);
      setVaultSessionToken(res.vaultToken);
      showToast('Bóveda desbloqueada con éxito.', 'success');
      onUnlocked();
    } catch (err: any) {
      const msg = err?.message || 'Clave PIN incorrecta.';
      setErrorMessage(msg);
      setPinDigits(['', '', '', '']);
      onRefreshStatus();
      setTimeout(() => {
        digitRefs[0].current?.focus();
      }, 50);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      const newDigits = [...pinDigits];
      newDigits[index] = '';
      setPinDigits(newDigits);
      return;
    }

    const digit = clean.slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setErrorMessage(null);

    if (index < 3) {
      digitRefs[index + 1].current?.focus();
    } else {
      // Completó los 4 dígitos
      const fullPin = newDigits.join('');
      if (fullPin.length === 4) {
        handleVerifyPin(fullPin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      digitRefs[index - 1].current?.focus();
    }
  };

  const handleKeypadPress = (val: string) => {
    if (isVerifying || vaultStatus?.isLockedOut) return;

    if (val === 'BACKSPACE') {
      const lastFilledIndex = [...pinDigits].reverse().findIndex((d) => d !== '');
      if (lastFilledIndex !== -1) {
        const actualIndex = 3 - lastFilledIndex;
        const newDigits = [...pinDigits];
        newDigits[actualIndex] = '';
        setPinDigits(newDigits);
        digitRefs[actualIndex].current?.focus();
      }
      return;
    }

    if (val === 'CLEAR') {
      setPinDigits(['', '', '', '']);
      setErrorMessage(null);
      digitRefs[0].current?.focus();
      return;
    }

    const firstEmptyIndex = pinDigits.findIndex((d) => d === '');
    if (firstEmptyIndex !== -1) {
      handleDigitChange(firstEmptyIndex, val);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="w-full max-w-[360px] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera de Seguridad */}
        <div className="p-6 bg-gradient-to-b from-indigo-950/60 via-slate-900 to-slate-900 border-b border-slate-800/80 text-center relative">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-indigo-950/50">
            <KeyRound className="w-6 h-6 text-indigo-400" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-2">
            <ShieldCheck className="w-3 h-3" />
            <span>Cifrado Militar AES-256-GCM</span>
          </div>

          <h2 className="text-lg font-bold text-white tracking-tight">Desbloquear Bóveda</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto leading-relaxed">
            Ingresa la <strong className="text-slate-200">clave numérica de 4 dígitos</strong> compartida verbalmente entre usuarios autorizados.
          </p>
        </div>

        {/* Cuerpo / Formulario */}
        <div className="p-6 space-y-4">
          {vaultStatus?.isLockedOut ? (
            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-rose-300">Bóveda Temporalmente Bloqueada</h3>
              <p className="text-[11px] text-rose-400 leading-snug">
                Se excedió el límite de intentos fallidos. Podrás reintentar en{' '}
                <strong>{vaultStatus.cooldownSeconds}s</strong> o a las{' '}
                <strong>
                  {vaultStatus.lockedUntil
                    ? new Date(vaultStatus.lockedUntil).toLocaleTimeString('es-CL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '15 min'}
                </strong>.
              </p>
              <button
                type="button"
                onClick={onRefreshStatus}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Comprobar Estado</span>
              </button>
            </div>
          ) : (
            <>
              {vaultStatus?.isDefaultPin && isAdmin && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Aviso Administrador:</span> El PIN maestro es el por defecto (
                    <code className="bg-amber-400/20 px-1 py-0.5 rounded font-mono text-amber-300 font-bold">1234</code>
                    ). Podrás cambiarlo una vez dentro.
                  </div>
                </div>
              )}

              {/* Casillas PIN */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    PIN Numérico (4 dígitos)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPinDigits(!showPinDigits)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                  >
                    {showPinDigits ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPinDigits ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <input
                      key={idx}
                      ref={digitRefs[idx]}
                      type={showPinDigits ? 'text' : 'password'}
                      name={`vault_sec_pin_digit_${idx}`}
                      id={`vault_sec_pin_digit_${idx}`}
                      autoComplete="one-time-code"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-lpignore="true"
                      data-1p-ignore="true"
                      data-bwignore="true"
                      data-form-type="other"
                      inputMode="numeric"
                      maxLength={1}
                      value={pinDigits[idx]}
                      disabled={isVerifying}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      aria-label={`Dígito ${idx + 1}`}
                      className={`w-full h-12 text-center text-xl font-mono font-bold rounded-2xl border-2 transition-all outline-none bg-slate-950 ${
                        errorMessage
                          ? 'border-rose-500 text-rose-300 ring-2 ring-rose-500/20'
                          : pinDigits[idx]
                          ? 'border-indigo-500 text-white shadow-lg shadow-indigo-950/50'
                          : 'border-slate-800 text-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Teclado táctil numérico */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleKeypadPress(digit)}
                    className="h-11 rounded-xl bg-slate-800/80 hover:bg-indigo-600/20 active:bg-indigo-600/30 border border-slate-700/60 hover:border-indigo-500/50 text-white font-mono font-bold text-lg transition-all cursor-pointer select-none"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleKeypadPress('CLEAR')}
                  className="h-11 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer select-none"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleKeypadPress('0')}
                  className="h-11 rounded-xl bg-slate-800/80 hover:bg-indigo-600/20 active:bg-indigo-600/30 border border-slate-700/60 hover:border-indigo-500/50 text-white font-mono font-bold text-lg transition-all cursor-pointer select-none"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isVerifying}
                  onClick={() => handleKeypadPress('BACKSPACE')}
                  className="h-11 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer select-none"
                  aria-label="Borrar dígito"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
