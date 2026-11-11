import React, { useState } from 'react';
import { Shield, Lock, Mail, Eye, EyeOff, KeyRound, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../services/api.js';
import type { User } from '../types/vault.js';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess, showToast }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setErrorMessage('Por favor ingresa tu correo y contraseña.');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await api.auth.login({ email: cleanEmail, password });
      showToast(`Bienvenido, ${res.user.name}`, 'success');
      onLoginSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Credenciales inválidas.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Luces y degradados cibernéticos de fondo */}
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 relative z-10 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="text-center space-y-3 mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-indigo-600/30">
            <Shield className="w-8 h-8 text-white" />
          </div>

          <div>
            <h1 className="text-2xl font-black text-white tracking-tight font-display">
              F1 KeyVault & Fortress
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Bóveda Corporativa de Contraseñas, Llaves y Secretos Cifrados
            </p>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-semibold">
            <Lock className="w-3 h-3 text-indigo-400" />
            <span>Acceso Seguro con Doble Factor de Bóveda</span>
          </div>
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="usuario@f1.services"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Contraseña
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>Iniciar Sesión en Fortress</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer de Seguridad */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 text-center space-y-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Protegido con cifrado de grado militar <strong className="text-slate-400">AES-256-GCM</strong>. Todos los accesos quedan registrados en la bitácora de auditoría inmutable.
          </p>
        </div>
      </div>
    </div>
  );
};
