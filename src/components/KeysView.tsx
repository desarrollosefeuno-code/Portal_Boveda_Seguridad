import { useCallback, useState } from 'react';
import { CalendarClock, Fingerprint, History, Pencil, Terminal, Trash2 } from 'lucide-react';
import { ActionMenu, Badge, Select, type Tone } from './f1-ui';
import { CardFooter, CopyButton, FavoriteButton, ItemsShell, SecretValue, useRevealed } from './VaultItems';
import { KeyModal, KEY_TYPE_LABEL } from './KeyModal';
import { api } from '../services/api';
import type { Environment, KeyInput, KeyMeta, KeySecret, SessionUser } from '../types/vault';
import { daysUntil, formatDate } from '../utils/secrets';

export const ENV_LABEL: Record<Environment, string> = { PROD: 'Producción', STAGING: 'Staging', QA: 'QA', DEV: 'Desarrollo' };
const ENV_TONE: Record<Environment, Tone> = { PROD: 'bad', STAGING: 'warn', QA: 'info', DEV: 'neutral' };

function ExpiryBadge({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days === null) return null;
  if (days < 0) return <Badge tone="bad" icon={CalendarClock}>Vencida {formatDate(date)}</Badge>;
  if (days <= 30) return <Badge tone="warn" icon={CalendarClock}>Vence en {days} d</Badge>;
  return <Badge tone="neutral" icon={CalendarClock}>Vence {formatDate(date)}</Badge>;
}

export function KeysView({ user }: { user: SessionUser }) {
  const isAdmin = user.role === 'admin';
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<KeyMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const [env, setEnv] = useState<'ALL' | Environment>('ALL');
  const revealFn = useCallback((id: string, purpose: 'VIEW' | 'COPY' | 'EDIT') => api.keys.reveal(id, purpose), []);
  const { revealed, reveal, hide } = useRevealed<KeySecret>(revealFn);
  const allowedEnvs = isAdmin ? (Object.keys(ENV_LABEL) as Environment[]) : user.keyEnvironments;

  const matches = useCallback(
    (k: KeyMeta, q: string) => [k.title, k.category, k.identifier, k.keyType, KEY_TYPE_LABEL[k.keyType], ...k.tags].some((v) => v?.toLowerCase().includes(q)),
    []
  );

  return (
    <>
      <ItemsShell<KeyMeta, KeySecret, KeyInput>
        icon={Terminal}
        title="Llaves, tokens y secretos técnicos"
        description={
          isAdmin
            ? 'API keys, tokens, llaves SSH, cadenas de conexión, PIN físicos y certificados por entorno.'
            : `Ves las llaves de los entornos que te habilitó un administrador: ${user.keyEnvironments.map((e) => ENV_LABEL[e]).join(', ') || 'ninguno'}.`
        }
        noun={{ one: 'llave', many: 'llaves' }}
        itemsApi={api.keys}
        isAdmin={isAdmin}
        matches={matches}
        reloadKey={reloadKey}
        onCreate={() => setCreating(true)}
        extraStats={(items) => {
          const soon = items.filter((k) => {
            const d = daysUntil(k.expiresAt);
            return d !== null && d <= 30;
          }).length;
          return [{ label: 'Vencidas o por vencer', value: soon, warn: soon > 0 }];
        }}
        filters={() => ({
          node: (
            <div className="w-full sm:w-52">
              <Select aria-label="Filtrar por entorno" value={env} onChange={(e) => setEnv(e.target.value as 'ALL' | Environment)}>
                <option value="ALL">Todos los entornos</option>
                {allowedEnvs.map((e) => <option key={e} value={e}>{ENV_LABEL[e]}</option>)}
              </Select>
            </div>
          ),
          apply: (k) => env === 'ALL' || k.environment === env,
        })}
        renderCard={(k, { askDelete, openVersions, toggleFavorite }) => {
          const secret = revealed[k.id];
          return (
            <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-shadow hover:matrix-frame">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-fg">{k.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={ENV_TONE[k.environment]}>{ENV_LABEL[k.environment]}</Badge>
                    <Badge tone="brand">{KEY_TYPE_LABEL[k.keyType]}</Badge>
                    <ExpiryBadge date={k.expiresAt} />
                  </div>
                </div>
                <FavoriteButton active={k.isFavorite} onClick={() => toggleFavorite(k)} />
                <ActionMenu
                  label={`Acciones de ${k.title}`}
                  actions={[
                    { label: 'Editar', icon: Pencil, onSelect: () => setEditing(k) },
                    ...(isAdmin ? [{ label: 'Historial', icon: History, onSelect: () => openVersions(k) }] : []),
                    { label: 'Eliminar', icon: Trash2, onSelect: () => askDelete(k), danger: true },
                  ]}
                />
              </div>

              {k.identifier && (
                <div className="flex items-center gap-2 text-sm">
                  <Fingerprint size={14} className="flex-shrink-0 text-fg-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono text-fg-2">{k.identifier}</span>
                  <CopyButton size="icon" label="Identificador" getText={() => k.identifier} />
                </div>
              )}

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-fg-3">Secreto</span>
                  <CopyButton label="Secreto" getText={async () => (await reveal(k.id, 'COPY'))?.secret ?? null} />
                </div>
                <SecretValue value={secret?.secret} shown={!!secret} onToggle={() => (secret ? hide(k.id) : reveal(k.id, 'VIEW'))} label="Secreto" />
              </div>

              {k.publicKey && (
                <details className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-fg-2">Clave pública / certificado</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-fg-2">{k.publicKey}</pre>
                  <div className="mt-2"><CopyButton label="Clave pública" getText={() => k.publicKey} /></div>
                </details>
              )}

              {secret && (Object.keys(secret.additionalData).length > 0 || secret.notes) && (
                <div className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  {Object.entries(secret.additionalData).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-28 flex-shrink-0 truncate text-xs text-fg-3">{key}</span>
                      <span className="min-w-0 flex-1 break-all font-mono text-fg">{value}</span>
                      <CopyButton size="icon" label={key} getText={() => value} />
                    </div>
                  ))}
                  {secret.notes && <p className="whitespace-pre-line border-t border-line pt-2 text-fg-2">{secret.notes}</p>}
                </div>
              )}

              <CardFooter tags={k.tags} updatedAt={k.updatedAt} updatedBy={k.updatedBy} />
            </article>
          );
        }}
      />

      <KeyModal
        open={creating || !!editing}
        editing={editing}
        allowedEnvironments={allowedEnvs}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          if (editing) hide(editing.id);
          setReloadKey((n) => n + 1);
        }}
      />
    </>
  );
}
