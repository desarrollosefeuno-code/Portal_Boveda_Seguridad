import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, History, RefreshCw } from 'lucide-react';
import { Badge, Button, F1Spinner, PageHeader, SearchBox, Select, type Tone, useToast } from './f1-ui';
import { api, errorMessage } from '../services/api';
import type { AuditLogEntry } from '../types/vault';
import { formatDateTime } from '../utils/secrets';

const EVENT_LABEL: Record<string, string> = {
  LOGIN_SUCCESS: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio fallido',
  LOGIN_BLOCKED: 'Inicio bloqueado',
  LOGIN_LOCKOUT: 'Cuenta bloqueada',
  LOGOUT: 'Cierre de sesión',
  CHANGE_PASSWORD: 'Cambio de contraseña',
  CHANGE_PASSWORD_FAILED: 'Cambio de contraseña fallido',
  UPDATE_PROFILE: 'Perfil actualizado',
  SETUP_PIN: 'PIN creado',
  PIN_SETUP_FAILED: 'Creación de PIN fallida',
  UNLOCK_VAULT_SUCCESS: 'Bóveda desbloqueada',
  UNLOCK_VAULT_FAILED: 'PIN incorrecto',
  LOCKOUT_TRIGGERED: 'Bóveda bloqueada por intentos',
  LOCK_VAULT: 'Bóveda bloqueada',
  CHANGE_PIN: 'Cambio de PIN',
  VIEW_PASSWORD: 'Contraseña vista',
  COPY_PASSWORD: 'Contraseña copiada',
  EDIT_PASSWORD: 'Contraseña abierta para editar',
  CREATE_PASSWORD: 'Credencial creada',
  UPDATE_PASSWORD: 'Credencial modificada',
  TRASH_PASSWORD: 'Credencial a la papelera',
  RESTORE_PASSWORD: 'Credencial restaurada',
  PURGE_PASSWORD: 'Credencial borrada',
  VIEW_PASSWORD_VERSION: 'Versión anterior vista',
  VIEW_KEY: 'Llave vista',
  COPY_KEY: 'Llave copiada',
  EDIT_KEY: 'Llave abierta para editar',
  CREATE_KEY: 'Llave creada',
  UPDATE_KEY: 'Llave modificada',
  TRASH_KEY: 'Llave a la papelera',
  RESTORE_KEY: 'Llave restaurada',
  PURGE_KEY: 'Llave borrada',
  VIEW_KEY_VERSION: 'Versión anterior vista',
  CREATE_USER: 'Usuario creado',
  UPDATE_USER: 'Usuario modificado',
  DELETE_USER: 'Usuario eliminado',
  RESET_PASSWORD: 'Contraseña reseteada',
  RESET_PIN: 'PIN reseteado',
  REQUEST_ADMIN: 'Solicitud de rol admin',
  GRANT_ADMIN: 'Rol admin otorgado',
  REJECT_ADMIN_REQUEST: 'Solicitud admin rechazada',
  DEMOTE_ADMIN: 'Rol admin retirado',
};

const toneFor = (event: string): Tone => {
  if (/FAILED|LOCKOUT|BLOCKED|PURGE|DELETE/.test(event)) return 'bad';
  if (/^(VIEW|COPY|EDIT)_/.test(event)) return 'warn';
  if (/CREATE|SUCCESS|SETUP|GRANT|RESTORE/.test(event)) return 'ok';
  if (/RESET|CHANGE|REQUEST|DEMOTE/.test(event)) return 'info';
  return 'neutral';
};

const TARGETS = [
  { id: 'ALL', label: 'Todo' },
  { id: 'PASSWORD', label: 'Contraseñas' },
  { id: 'KEY', label: 'Llaves' },
  { id: 'VAULT', label: 'Bóveda' },
  { id: 'AUTH', label: 'Accesos' },
  { id: 'USER', label: 'Usuarios' },
];

export function AuditLogView() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState('ALL');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [data, setData] = useState<{ items: AuditLogEntry[]; totalPages: number; totalCount: number; scope: 'all' | 'own' } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.audit.list({ page, limit: 50, targetType: target, search: debounced || undefined });
      setData({ items: res.items, totalPages: res.pagination.totalPages, totalCount: res.pagination.totalCount, scope: res.scope });
    } catch (err) {
      toast.error(errorMessage(err, 'No se pudo cargar la bitácora.'));
    } finally {
      setLoading(false);
    }
  }, [page, target, debounced, toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="grid gap-5">
      <PageHeader
        icon={History}
        title="Bitácora de auditoría"
        description={
          data?.scope === 'own'
            ? 'Tus propios eventos: accesos, desbloqueos y cada secreto que viste, copiaste o cambiaste.'
            : 'Registro inmutable de todos los eventos de la bóveda. La base de datos rechaza modificarlo o borrarlo.'
        }
        stats={data ? [{ label: 'Eventos encontrados', value: data.totalCount.toLocaleString('es-CL') }] : undefined}
        actions={<Button variant="secondary" icon={RefreshCw} loading={loading} loadingText="Actualizando…" onClick={load}>Actualizar</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por registro, correo o nombre…" label="Buscar en la bitácora" className="flex-1" />
        <div className="sm:w-52">
          <Select aria-label="Tipo de registro" value={target} onChange={(e) => { setTarget(e.target.value); setPage(1); }}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </Select>
        </div>
      </div>

      {!data ? (
        <div className="grid place-items-center py-16"><F1Spinner size="md" text="Leyendo la bitácora…" /></div>
      ) : data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-2">No hay eventos con esos filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Eventos de auditoría</caption>
            <thead className="bg-thead text-left text-xs uppercase tracking-wide text-fg-2">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha</th>
                <th scope="col" className="px-4 py-3">Evento</th>
                <th scope="col" className="px-4 py-3">Registro</th>
                <th scope="col" className="px-4 py-3">Usuario</th>
                <th scope="col" className="px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((e) => (
                <tr key={e.id} className="hover:bg-hover">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-fg-2">{formatDateTime(e.created_at)}</td>
                  <td className="px-4 py-2.5"><Badge tone={toneFor(e.event_type)}>{EVENT_LABEL[e.event_type] ?? e.event_type}</Badge></td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-fg">{e.target_title ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className="block text-fg">{e.user_name ?? e.user_email}</span>
                    <span className="block text-xs text-fg-3">{e.user_email}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-3" title={e.user_agent ?? undefined}>{e.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-line md:hidden">
            {data.items.map((e) => (
              <li key={e.id} className="grid gap-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={toneFor(e.event_type)}>{EVENT_LABEL[e.event_type] ?? e.event_type}</Badge>
                  <span className="text-xs tabular-nums text-fg-3">{formatDateTime(e.created_at)}</span>
                </div>
                {e.target_title && <p className="truncate text-sm text-fg">{e.target_title}</p>}
                <p className="text-xs text-fg-3">{e.user_email} · {e.ip_address ?? '—'}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <nav aria-label="Páginas de la bitácora" className="flex items-center justify-between gap-3">
          <Button variant="secondary" icon={ChevronLeft} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="text-sm tabular-nums text-fg-2">Página {page} de {data.totalPages}</span>
          <Button variant="secondary" disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>
            Siguiente <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </nav>
      )}
    </section>
  );
}
