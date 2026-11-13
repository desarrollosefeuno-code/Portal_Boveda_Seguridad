import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArchiveRestore, Check, Copy, Eye, EyeOff, History, Plus, Star, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, EmptyState, F1Spinner, IconButton, Modal, PageHeader, SearchBox, cn, useToast } from './f1-ui';
import { errorMessage, type ItemsApi } from '../services/api';
import type { RevealPurpose, SecretVersion } from '../types/vault';
import { copySecret, formatDateTime, SECRET_TTL_MS } from '../utils/secrets';

interface BaseMeta {
  id: string;
  title: string;
  isFavorite: boolean;
  tags: string[];
  deletedAt: string | null;
  deletedBy: string | null;
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Secretos revelados en memoria, uno por registro, que se borran solos a los 30 s (M-06).
 * Cada revelación la registra el servidor; aquí no queda nada en almacenamiento del navegador.
 */
export function useRevealed<Secret>(revealFn: (id: string, purpose: RevealPurpose) => Promise<Secret>) {
  const [revealed, setRevealed] = useState<Record<string, Secret>>({});
  const timers = useRef<Record<string, number>>({});
  const toast = useToast();

  const hide = useCallback((id: string) => {
    window.clearTimeout(timers.current[id]);
    setRevealed((prev) => {
      const { [id]: _drop, ...rest } = prev;
      return rest;
    });
  }, []);

  const reveal = useCallback(
    async (id: string, purpose: RevealPurpose): Promise<Secret | null> => {
      try {
        const data = await revealFn(id, purpose);
        if (purpose === 'VIEW') {
          setRevealed((prev) => ({ ...prev, [id]: data }));
          window.clearTimeout(timers.current[id]);
          timers.current[id] = window.setTimeout(() => hide(id), SECRET_TTL_MS);
        }
        return data;
      } catch (err) {
        toast.error(errorMessage(err, 'No se pudo obtener el secreto.'));
        return null;
      }
    },
    [revealFn, hide, toast]
  );

  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);
  const clearAll = useCallback(() => setRevealed({}), []);
  return { revealed, reveal, hide, clearAll };
}

/** Botón de copiar con confirmación visual; el portapapeles se vacía a los 30 s. */
export function CopyButton({ label, getText, size = 'sm' }: { label: string; getText: () => Promise<string | null> | string | null; size?: 'sm' | 'icon' }) {
  const [done, setDone] = useState(false);
  const toast = useToast();
  const run = async () => {
    const text = await getText();
    if (!text) return;
    try {
      await copySecret(text);
      setDone(true);
      toast.success(`${label} copiado. El portapapeles se vaciará en 30 segundos.`);
      window.setTimeout(() => setDone(false), 2000);
    } catch {
      toast.error('El navegador no permitió copiar al portapapeles.');
    }
  };
  if (size === 'icon') return <IconButton label={`Copiar ${label.toLowerCase()}`} icon={done ? Check : Copy} onClick={run} />;
  return (
    <Button variant="secondary" size="sm" icon={done ? Check : Copy} onClick={run}>
      {done ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

/** Valor sensible enmascarado con Ver/Ocultar. */
export function SecretValue({ value, shown, onToggle, label, mono = true }: { value: string | undefined; shown: boolean; onToggle: () => void; label: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className={cn('min-h-9 flex-1 break-all rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm', mono && 'font-mono')}>
        {shown && value !== undefined ? <span className="select-all text-fg">{value || '—'}</span> : <span className="tracking-[0.3em] text-fg-3" aria-label={`${label} oculta`}>••••••••••••</span>}
      </div>
      <IconButton label={shown ? `Ocultar ${label.toLowerCase()}` : `Ver ${label.toLowerCase()}`} icon={shown ? EyeOff : Eye} onClick={onToggle} />
    </div>
  );
}

export function VersionsModal<M, S, I>({ open, onClose, itemsApi, itemId, title }: { open: boolean; onClose: () => void; itemsApi: ItemsApi<M, S, I>; itemId: string | null; title: string }) {
  const [versions, setVersions] = useState<SecretVersion[] | null>(null);
  const [shown, setShown] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    if (!open || !itemId) return;
    setVersions(null);
    setShown({});
    itemsApi.versions(itemId).then((r) => setVersions(r.items)).catch((err) => toast.error(errorMessage(err)));
  }, [open, itemId, itemsApi, toast]);

  const toggle = async (v: SecretVersion) => {
    if (shown[v.id] !== undefined) {
      setShown(({ [v.id]: _d, ...rest }) => rest);
      return;
    }
    try {
      const { value } = await itemsApi.revealVersion(v.id);
      setShown((p) => ({ ...p, [v.id]: value }));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Historial del secreto" subtitle={title} icon={<History size={20} />} size="md">
      {versions === null ? (
        <F1Spinner size="sm" text="Cargando historial…" />
      ) : versions.length === 0 ? (
        <p className="text-sm text-fg-2">Este secreto no se ha cambiado desde que se creó.</p>
      ) : (
        <ul className="grid gap-3">
          {versions.map((v) => (
            <li key={v.id} className="grid gap-2 rounded-xl border border-line p-3">
              <p className="text-xs text-fg-3">
                Reemplazado el {formatDateTime(v.replacedAt)} por {v.replacedBy}
              </p>
              <SecretValue value={shown[v.id]} shown={shown[v.id] !== undefined} onToggle={() => toggle(v)} label="Valor anterior" />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Estructura común de Contraseñas y Llaves: cabecera, búsqueda, favoritos, papelera (admin),
 * confirmaciones con el kit y carga.
 */
export function ItemsShell<M extends BaseMeta, S, I>({
  icon,
  title,
  description,
  noun,
  itemsApi,
  isAdmin,
  matches,
  filters,
  renderCard,
  onCreate,
  reloadKey,
  extraStats,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  noun: { one: string; many: string };
  itemsApi: ItemsApi<M, S, I>;
  isAdmin: boolean;
  matches: (item: M, q: string) => boolean;
  filters?: (items: M[]) => { node: React.ReactNode; apply: (item: M) => boolean };
  renderCard: (item: M, helpers: { refresh: () => void; askDelete: (item: M) => void; openVersions: (item: M) => void; toggleFavorite: (item: M) => void }) => React.ReactNode;
  onCreate: () => void;
  reloadKey: number;
  extraStats?: (items: M[]) => Array<{ label: string; value: React.ReactNode; warn?: boolean }>;
}) {
  const toast = useToast();
  const [items, setItems] = useState<M[] | null>(null);
  const [trash, setTrash] = useState<M[] | null>(null);
  const [mode, setMode] = useState<'active' | 'trash'>('active');
  const [query, setQuery] = useState('');
  const [onlyFav, setOnlyFav] = useState(false);
  const [confirm, setConfirm] = useState<{ item: M; kind: 'trash' | 'purge' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [versionsFor, setVersionsFor] = useState<M | null>(null);

  const load = useCallback(async () => {
    try {
      if (mode === 'trash') setTrash((await itemsApi.trash()).items);
      else setItems((await itemsApi.list()).items);
    } catch (err) {
      toast.error(errorMessage(err, `No se pudieron cargar las ${noun.many}.`));
    }
  }, [itemsApi, mode, noun.many, toast]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const list = mode === 'trash' ? trash : items;
  const custom = filters && items ? filters(items) : null;
  const visible = useMemo(() => {
    if (!list) return [];
    const q = query.trim().toLowerCase();
    return list.filter((i) => (!onlyFav || i.isFavorite) && (!q || matches(i, q)) && (mode === 'trash' || !custom || custom.apply(i)));
  }, [list, query, onlyFav, matches, mode, custom]);

  const toggleFavorite = async (item: M) => {
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, isFavorite: !i.isFavorite } : i)) ?? prev);
    try {
      await itemsApi.favorite(item.id, !item.isFavorite);
    } catch (err) {
      toast.error(errorMessage(err));
      load();
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = confirm.kind === 'trash' ? await itemsApi.remove(confirm.item.id) : await itemsApi.purge(confirm.item.id);
      toast.success(res.message || 'Listo.');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (item: M) => {
    try {
      const res = await itemsApi.restore(item.id);
      toast.success(res.message || 'Restaurado.');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const stats = items
    ? [{ label: 'Registros', value: items.length }, { label: 'Favoritos', value: items.filter((i) => i.isFavorite).length }, ...(extraStats?.(items) ?? [])]
    : undefined;

  return (
    <section className="grid gap-5" aria-labelledby={`title-${noun.many}`}>
      <PageHeader
        icon={icon}
        title={title}
        description={description}
        stats={mode === 'active' ? stats : undefined}
        actions={
          <>
            {isAdmin && (
              <Button variant="secondary" icon={mode === 'trash' ? ArchiveRestore : Trash2} onClick={() => setMode(mode === 'trash' ? 'active' : 'trash')}>
                {mode === 'trash' ? 'Volver al listado' : 'Papelera'}
              </Button>
            )}
            {mode === 'active' && <Button icon={Plus} onClick={onCreate}>Nueva {noun.one}</Button>}
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchBox value={query} onChange={setQuery} placeholder="Buscar por título, categoría, etiqueta…" label={`Buscar ${noun.many}`} className="flex-1" />
        {mode === 'active' && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {custom?.node}
            <Button variant={onlyFav ? 'primary' : 'secondary'} icon={Star} onClick={() => setOnlyFav(!onlyFav)} aria-pressed={onlyFav}>
              Favoritos
            </Button>
          </div>
        )}
      </div>

      {mode === 'trash' && <p className="text-sm text-fg-2">Elementos eliminados. Puedes restaurarlos o borrarlos para siempre (junto con su historial).</p>}

      {list === null ? (
        <div className="grid place-items-center py-16">
          <F1Spinner size="md" text={`Descifrando el índice de ${noun.many}…`} />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={icon}
          title={list.length === 0 ? (mode === 'trash' ? 'La papelera está vacía' : `Aún no hay ${noun.many}`) : 'Sin resultados'}
          text={list.length === 0 ? (mode === 'trash' ? 'Lo que elimines aparecerá aquí.' : `Registra la primera ${noun.one} de la bóveda.`) : 'Prueba con otra búsqueda o quita los filtros.'}
          action={list.length === 0 && mode === 'active' ? <Button icon={Plus} onClick={onCreate}>Nueva {noun.one}</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <li key={item.id} className="animate-matrix-in">
              {mode === 'trash' ? (
                <article className="grid h-full gap-3 rounded-2xl border border-line bg-surface p-4">
                  <div>
                    <h3 className="font-bold text-fg">{item.title}</h3>
                    <p className="mt-1 text-xs text-fg-3">Eliminada el {formatDateTime(item.deletedAt)} por {item.deletedBy}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" icon={ArchiveRestore} onClick={() => restore(item)}>Restaurar</Button>
                    <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirm({ item, kind: 'purge' })}>Borrar para siempre</Button>
                  </div>
                </article>
              ) : (
                renderCard(item, { refresh: load, askDelete: (i) => setConfirm({ item: i, kind: 'trash' }), openVersions: setVersionsFor, toggleFavorite })
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'purge' ? `Borrar "${confirm?.item.title}" para siempre` : `Enviar "${confirm?.item.title}" a la papelera`}
        message={confirm?.kind === 'purge' ? 'Se eliminará el registro y todo su historial. No se puede deshacer.' : 'Un administrador podrá restaurarlo desde la papelera.'}
        warning={confirm?.kind === 'purge' ? 'Esta acción es definitiva.' : undefined}
        actions={[
          { label: confirm?.kind === 'purge' ? 'Borrar para siempre' : 'Enviar a la papelera', tone: 'danger', onClick: runConfirm, loading: busy },
          { label: 'Cancelar', tone: 'neutral', onClick: () => setConfirm(null) },
        ]}
      />

      {isAdmin && <VersionsModal open={!!versionsFor} onClose={() => setVersionsFor(null)} itemsApi={itemsApi} itemId={versionsFor?.id ?? null} title={versionsFor?.title ?? ''} />}
    </section>
  );
}

/** Pie común de cada tarjeta: etiquetas y autoría. */
export function CardFooter({ tags, updatedAt, updatedBy }: { tags: string[]; updatedAt: string; updatedBy?: string }) {
  return (
    <div className="mt-auto grid gap-2 border-t border-line pt-3">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <Badge key={t} tone="neutral">{t}</Badge>
          ))}
        </div>
      )}
      <p className="text-[11px] text-fg-3">Actualizado {formatDateTime(updatedAt)}{updatedBy ? ` · ${updatedBy}` : ''}</p>
    </div>
  );
}

export function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? 'Quitar de favoritos' : 'Marcar como favorito'}
      className={cn('flex h-9 w-9 items-center justify-center rounded-[10px] hover:bg-brand-soft pointer-coarse:h-11 pointer-coarse:w-11', active ? 'text-warn' : 'text-fg-3')}
    >
      <Star size={16} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
