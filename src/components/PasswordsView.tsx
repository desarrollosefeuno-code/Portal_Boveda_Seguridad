import { useCallback, useState } from 'react';
import { ExternalLink, Globe, History, KeyRound, Pencil, Trash2, UserRound } from 'lucide-react';
import { ActionMenu, Badge } from './f1-ui';
import { CardFooter, CopyButton, FavoriteButton, ItemsShell, SecretValue, useRevealed } from './VaultItems';
import { PasswordModal } from './PasswordModal';
import { api } from '../services/api';
import type { PasswordInput, PasswordMeta, PasswordSecret } from '../types/vault';
import { safeHref } from '../utils/secrets';

export function PasswordsView({ isAdmin }: { isAdmin: boolean }) {
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<PasswordMeta | null>(null);
  const [creating, setCreating] = useState(false);
  const revealFn = useCallback((id: string, purpose: 'VIEW' | 'COPY' | 'EDIT') => api.passwords.reveal(id, purpose), []);
  const { revealed, reveal, hide } = useRevealed<PasswordSecret>(revealFn);

  const matches = useCallback(
    (p: PasswordMeta, q: string) =>
      [p.title, p.category, p.url, p.username, ...p.tags].some((v) => v?.toLowerCase().includes(q)),
    []
  );

  return (
    <>
      <ItemsShell<PasswordMeta, PasswordSecret, PasswordInput>
        icon={Globe}
        title="Contraseñas de portales"
        description="Accesos web, SaaS, correos y paneles. Las contraseñas no se descargan con el listado: cada vez que las ves o copias, queda registrado en la bitácora."
        noun={{ one: 'credencial', many: 'credenciales' }}
        itemsApi={api.passwords}
        isAdmin={isAdmin}
        matches={matches}
        reloadKey={reloadKey}
        onCreate={() => setCreating(true)}
        renderCard={(p, { askDelete, openVersions, toggleFavorite }) => {
          const secret = revealed[p.id];
          const href = p.url ? safeHref(p.url) : null;
          return (
            <article className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4 transition-shadow hover:matrix-frame">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-fg">{p.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{p.category}</Badge>
                    {p.hasExtra && <Badge tone="info">Datos adicionales</Badge>}
                    {p.hasNotes && <Badge tone="neutral">Notas</Badge>}
                  </div>
                </div>
                <FavoriteButton active={p.isFavorite} onClick={() => toggleFavorite(p)} />
                <ActionMenu
                  label={`Acciones de ${p.title}`}
                  actions={[
                    { label: 'Editar', icon: Pencil, onSelect: () => setEditing(p) },
                    ...(isAdmin ? [{ label: 'Historial', icon: History, onSelect: () => openVersions(p) }] : []),
                    { label: 'Eliminar', icon: Trash2, onSelect: () => askDelete(p), danger: true },
                  ]}
                />
              </div>

              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-sm text-support-fg hover:underline">
                  <ExternalLink size={14} aria-hidden="true" />
                  <span className="truncate">{p.url}</span>
                </a>
              )}

              {p.username && (
                <div className="flex items-center gap-2 text-sm">
                  <UserRound size={14} className="flex-shrink-0 text-fg-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-fg-2">{p.username}</span>
                  <CopyButton size="icon" label="Usuario" getText={() => p.username} />
                </div>
              )}

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-3"><KeyRound size={13} aria-hidden="true" />Contraseña</span>
                  <CopyButton label="Contraseña" getText={async () => (await reveal(p.id, 'COPY'))?.password ?? null} />
                </div>
                <SecretValue value={secret?.password} shown={!!secret} onToggle={() => (secret ? hide(p.id) : reveal(p.id, 'VIEW'))} label="Contraseña" />
              </div>

              {secret && (secret.additionalFields.length > 0 || secret.notes) && (
                <div className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  {secret.additionalFields.map((f) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <span className="w-28 flex-shrink-0 truncate text-xs text-fg-3">{f.key}</span>
                      <span className="min-w-0 flex-1 break-all text-fg">{f.value}</span>
                      <CopyButton size="icon" label={f.key} getText={() => f.value} />
                    </div>
                  ))}
                  {secret.notes && <p className="whitespace-pre-line border-t border-line pt-2 text-fg-2">{secret.notes}</p>}
                </div>
              )}

              <CardFooter tags={p.tags} updatedAt={p.updatedAt} updatedBy={p.updatedBy} />
            </article>
          );
        }}
      />

      <PasswordModal
        open={creating || !!editing}
        editing={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          if (editing) hide(editing.id);
          setReloadKey((k) => k + 1);
        }}
      />
    </>
  );
}
