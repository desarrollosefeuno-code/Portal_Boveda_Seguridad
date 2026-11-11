import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  FileCode2,
  Copy,
  Eye,
  Trash2,
  Edit,
  Plus,
  Lock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { AuditLogEntry } from '../types/vault.js';
import { api } from '../services/api.js';

interface AuditLogViewProps {
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const EVENT_TYPE_MAP: Record<string, { label: string; badge: string; icon: any }> = {
  LOGIN_SUCCESS: { label: 'Inicio de Sesión Exitoso', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: ShieldCheck },
  LOGIN_FAILED: { label: 'Fallo de Login', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: ShieldAlert },
  LOGOUT: { label: 'Cierre de Sesión', badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: Lock },
  UNLOCK_VAULT_SUCCESS: { label: 'Bóveda Desbloqueada', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: KeyRound },
  UNLOCK_VAULT_FAILED: { label: 'PIN Incorrecto', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: AlertTriangle },
  LOCKOUT_TRIGGERED: { label: 'Bloqueo por Fuerza Bruta', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40', icon: ShieldAlert },
  CHANGE_PIN: { label: 'Cambio de PIN Maestro', badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20', icon: Lock },
  VIEW_PASSWORD: { label: 'Reveló Contraseña', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: Eye },
  COPY_PASSWORD: { label: 'Copió Contraseña / Usuario', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: Copy },
  VIEW_KEY: { label: 'Reveló Secreto / Token', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Eye },
  COPY_KEY: { label: 'Copió Token / Secreto', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Copy },
  CREATE_PASSWORD: { label: 'Creó Contraseña de Portal', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Plus },
  UPDATE_PASSWORD: { label: 'Editó Contraseña de Portal', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Edit },
  DELETE_PASSWORD: { label: 'Eliminó Contraseña de Portal', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: Trash2 },
  CREATE_KEY: { label: 'Creó Llave / Token', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Plus },
  UPDATE_KEY: { label: 'Editó Llave / Token', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Edit },
  DELETE_KEY: { label: 'Eliminó Llave / Token', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: Trash2 },
  CREATE_USER: { label: 'Creó Usuario', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: Plus },
  UPDATE_USER: { label: 'Editó Usuario', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', icon: Edit },
  DELETE_USER: { label: 'Eliminó Usuario', badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: Trash2 },
};

function AlertTriangle(props: any) {
  return <ShieldAlert {...props} />;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ showToast }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedEventType, setSelectedEventType] = useState('ALL');
  const [selectedTargetType, setSelectedTargetType] = useState('ALL');
  const [search, setSearch] = useState('');

  const loadLogs = async (newPage = 1) => {
    try {
      setIsLoading(true);
      const res = await api.audit.getLogs({
        page: newPage,
        limit: 50,
        eventType: selectedEventType !== 'ALL' ? selectedEventType : undefined,
        targetType: selectedTargetType !== 'ALL' ? selectedTargetType : undefined,
        search: search.trim() || undefined,
      });
      setLogs(res.items);
      setPage(res.pagination.page);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.totalCount);
    } catch (err: any) {
      showToast('Error al cargar bitácora de auditoría.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1);
  }, [selectedEventType, selectedTargetType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs(1);
  };

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight font-display">
              Bitácora Inmutable de Auditoría
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
              {totalCount} Eventos Registrados
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Registro cronológico estricto de accesos, intentos de desbloqueo, revelación de credenciales y cambios.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLogs(page)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Actualizar Bitácora</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            placeholder="Buscar por usuario, título de credencial o acción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEventType}
            onChange={(e) => setSelectedEventType(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos los Eventos</option>
            {Object.entries(EVENT_TYPE_MAP).map(([typeKey, cfg]) => (
              <option key={typeKey} value={typeKey}>
                {cfg.label}
              </option>
            ))}
          </select>

          <select
            value={selectedTargetType}
            onChange={(e) => setSelectedTargetType(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos los Tipos</option>
            <option value="PASSWORD">Contraseñas de Portales</option>
            <option value="KEY">Llaves & Tokens</option>
            <option value="VAULT">Acceso a Bóveda</option>
            <option value="USER">Gestión de Usuarios</option>
            <option value="AUTH">Sesiones de Login</option>
          </select>
        </div>
      </div>

      {/* Tabla de Auditoría */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-[10px] uppercase font-bold tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Fecha y Hora</th>
                <th className="px-5 py-3.5">Evento</th>
                <th className="px-5 py-3.5">Objetivo / Recurso</th>
                <th className="px-5 py-3.5">Usuario</th>
                <th className="px-5 py-3.5">IP & Origen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">
                    No hay eventos registrados que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const cfg = EVENT_TYPE_MAP[log.event_type] || {
                    label: log.event_type,
                    badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                    icon: History,
                  };
                  const Icon = cfg.icon;

                  return (
                    <tr key={log.id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {new Date(log.created_at).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${cfg.badge}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{cfg.label}</span>
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="font-bold text-white truncate max-w-[240px]">
                          {log.target_title || '—'}
                        </div>
                        {log.target_type && (
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                            {log.target_type}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-200">{log.user_email}</div>
                        {log.user_name && (
                          <div className="text-[10px] text-slate-500">{log.user_name}</div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        <div>{log.ip_address || '—'}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Página <strong className="text-white">{page}</strong> de <strong className="text-white">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadLogs(page - 1)}
                disabled={page <= 1 || isLoading}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => loadLogs(page + 1)}
                disabled={page >= totalPages || isLoading}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
