import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Star,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Globe,
  Lock,
  X,
  Building2,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import type { VaultPasswordEntry } from '../types/vault.js';
import { api } from '../services/api.js';

interface PasswordsViewProps {
  entries: VaultPasswordEntry[];
  onRefresh: () => Promise<void>;
  onOpenCreate: () => void;
  onOpenEdit: (entry: VaultPasswordEntry) => void;
  onDelete: (entry: VaultPasswordEntry) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  userEmail?: string;
}

export const PasswordsView: React.FC<PasswordsViewProps> = ({
  entries,
  onRefresh,
  onOpenCreate,
  onOpenEdit,
  onDelete,
  showToast,
  userEmail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [visibleExtraFields, setVisibleExtraFields] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Blindaje Anti-Autocompletado de Chrome/Edge
  useEffect(() => {
    const el = searchInputRef.current;
    const purgeAutofill = () => {
      setSearchTerm((current) => {
        if (
          current &&
          (current.toLowerCase() === 'carlos.inostroza@f1.services' ||
            (userEmail && current.trim().toLowerCase() === userEmail.trim().toLowerCase()))
        ) {
          return '';
        }
        return current;
      });

      if (el && el.value) {
        const val = el.value.trim().toLowerCase();
        if (
          val === 'carlos.inostroza@f1.services' ||
          (userEmail && val === userEmail.trim().toLowerCase())
        ) {
          el.value = '';
        }
      }
    };

    purgeAutofill();
    const timers = [30, 80, 150, 300, 600, 1000].map((ms) => setTimeout(purgeAutofill, ms));

    const handleNative = () => purgeAutofill();
    if (el) {
      el.addEventListener('input', handleNative);
      el.addEventListener('change', handleNative);
    }

    return () => {
      timers.forEach(clearTimeout);
      if (el) {
        el.removeEventListener('input', handleNative);
        el.removeEventListener('change', handleNative);
      }
    };
  }, [userEmail]);

  const handleCopy = async (text: string, key: string, entryId: string, fieldName: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showToast(`${fieldName} copiado al portapapeles.`, 'success');
      api.passwords.logAction(entryId, 'COPY', fieldName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const togglePasswordVisibility = (id: string) => {
    const isNowVisible = !visiblePasswords[id];
    setVisiblePasswords((prev) => ({ ...prev, [id]: isNowVisible }));
    if (isNowVisible) {
      api.passwords.logAction(id, 'VIEW', 'password');
    }
  };

  const handleToggleFavorite = async (entry: VaultPasswordEntry) => {
    try {
      await api.passwords.update(entry.id, { isFavorite: !entry.isFavorite });
      await onRefresh();
    } catch {
      showToast('Error al actualizar favorito.', 'error');
    }
  };

  // Filtrado
  const categories = Array.from(new Set(entries.map((e) => e.category).filter(Boolean)));

  const filteredEntries = entries.filter((entry) => {
    if (onlyFavorites && !entry.isFavorite) return false;
    if (selectedCategory !== 'ALL' && entry.category !== selectedCategory) return false;
    if (!searchTerm.trim()) return true;

    const q = searchTerm.toLowerCase();
    const matchTitle = entry.title?.toLowerCase().includes(q);
    const matchUser = entry.username?.toLowerCase().includes(q);
    const matchUrl = entry.url?.toLowerCase().includes(q);
    const matchTags = entry.tags?.some((t) => t.toLowerCase().includes(q));
    const matchNotes = entry.notes?.toLowerCase().includes(q);
    const matchExtra = entry.additionalFields?.some(
      (f) => f.key.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)
    );

    return matchTitle || matchUser || matchUrl || matchTags || matchNotes || matchExtra;
  });

  return (
    <div className="space-y-6">
      {/* Trampa señuelo offscreen contra el autocompletado del navegador */}
      <div
        style={{
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        <input type="text" name="decoy_username_field" tabIndex={-1} autoComplete="username" defaultValue="" />
        <input type="password" name="decoy_password_field" tabIndex={-1} autoComplete="current-password" defaultValue="" />
      </div>

      {/* Cabecera de la Sección */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight font-display">
              Contraseñas de Portales y Accesos
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
              {filteredEntries.length} de {entries.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Plataformas web, portales de clientes, SaaS, correos y sistemas de gestión con cifrado AES-256-GCM.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Credencial de Portal</span>
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Buscador */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="search"
            name="portal_passwords_search_filter"
            id="portal_passwords_search_filter"
            readOnly={!isSearchActive}
            onFocus={() => setIsSearchActive(true)}
            onPointerDown={() => setIsSearchActive(true)}
            autoComplete="one-time-code"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            placeholder="Buscar por portal, usuario, URL, etiqueta, notas..."
            value={searchTerm}
            onChange={(e) => {
              const val = e.target.value;
              if (
                val &&
                !searchTerm &&
                (val.toLowerCase() === 'carlos.inostroza@f1.services' ||
                  (userEmail && val.trim().toLowerCase() === userEmail.trim().toLowerCase()))
              ) {
                if (searchInputRef.current) searchInputRef.current.value = '';
                setSearchTerm('');
                return;
              }
              setSearchTerm(val);
            }}
            className="w-full pl-10 pr-9 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                if (searchInputRef.current) searchInputRef.current.value = '';
                setSearchTerm('');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Categoría y Favoritos */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todas las Categorías ({entries.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyFavorites(!onlyFavorites)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              onlyFavorites
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>Favoritos</span>
          </button>
        </div>
      </div>

      {/* Grid de Tarjetas de Contraseñas */}
      {filteredEntries.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No se encontraron contraseñas</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm || selectedCategory !== 'ALL' || onlyFavorites
              ? 'Prueba modificando tus términos de búsqueda o filtros.'
              : 'Agrega tu primera credencial de portal cifrada con AES-256-GCM.'}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Primera Credencial</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => {
            const isPasswordShown = Boolean(visiblePasswords[entry.id]);
            const isExtraShown = Boolean(visibleExtraFields[entry.id]);

            return (
              <div
                key={entry.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/40 rounded-3xl p-5 shadow-xl transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  {/* Encabezado */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(entry)}
                        className="mt-0.5 p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-amber-400 transition-colors cursor-pointer shrink-0"
                        title={entry.isFavorite ? 'Quitar de favoritos' : 'Marcar favorito'}
                      >
                        <Star
                          className={`w-4 h-4 ${entry.isFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
                        />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-white truncate font-display">
                            {entry.title}
                          </h3>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                            {entry.category || 'General'}
                          </span>
                        </div>

                        {entry.url && (
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-indigo-400 truncate">
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            <a
                              href={entry.url.startsWith('http') ? entry.url : `https://${entry.url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline truncate"
                            >
                              {entry.url}
                            </a>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenEdit(entry)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Editar credencial"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(entry)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Eliminar credencial"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Bloque Usuario y Contraseña */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Usuario */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          Usuario / Acceso
                        </span>
                        <span className="block text-xs font-mono font-semibold text-slate-200 truncate mt-0.5">
                          {entry.username || '—'}
                        </span>
                      </div>
                      {entry.username && (
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.username, `user-${entry.id}`, entry.id, 'Usuario')}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-300 border border-slate-800 transition-colors shrink-0 cursor-pointer"
                          title="Copiar usuario"
                        >
                          {copiedKey === `user-${entry.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Contraseña */}
                    <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-500">
                          Contraseña
                        </span>
                        <span className="block text-xs font-mono font-bold text-white truncate mt-0.5">
                          {isPasswordShown ? entry.password : '••••••••••••••••'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => togglePasswordVisibility(entry.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                          title={isPasswordShown ? 'Ocultar contraseña' : 'Ver contraseña'}
                        >
                          {isPasswordShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.password || '', `pass-${entry.id}`, entry.id, 'Contraseña')}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-300 border border-slate-800 transition-colors shrink-0 cursor-pointer"
                          title="Copiar contraseña"
                        >
                          {copiedKey === `pass-${entry.id}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Campos Adicionales */}
                  {entry.additionalFields && entry.additionalFields.length > 0 && (
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-400">Datos Adicionales ({entry.additionalFields.length})</span>
                        <button
                          type="button"
                          onClick={() => setVisibleExtraFields((p) => ({ ...p, [entry.id]: !p[entry.id] }))}
                          className="text-indigo-400 hover:underline cursor-pointer"
                        >
                          {isExtraShown ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>

                      {isExtraShown && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                          {entry.additionalFields.map((f, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded-lg text-xs">
                              <span className="text-slate-400 text-[11px] font-medium">{f.key}:</span>
                              <div className="flex items-center gap-1.5 font-mono text-slate-200">
                                <span>{f.value}</span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(f.value, `extra-${entry.id}-${i}`, entry.id, f.key)}
                                  className="text-slate-500 hover:text-indigo-400"
                                >
                                  {copiedKey === `extra-${entry.id}-${i}` ? (
                                    <Check className="w-3 h-3 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notas Seguras */}
                  {entry.notes && (
                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/40 text-xs text-slate-400">
                      <span className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Notas / Instrucciones:</span>
                      <p className="whitespace-pre-line leading-relaxed">{entry.notes}</p>
                    </div>
                  )}

                  {/* Etiquetas */}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {entry.tags.map((t, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400 text-[10px]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <span>Actualizado: {new Date(entry.updatedAt).toLocaleDateString('es-CL')}</span>
                  <span>Por: {entry.updatedBy || 'Sistema'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

