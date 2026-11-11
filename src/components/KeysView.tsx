import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Star,
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  X,
  FileCode2,
  Terminal,
  Database,
  Lock,
  Server,
  Key,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import type { VaultKeyEntry, KeyType, Environment } from '../types/vault.js';
import { api } from '../services/api.js';

interface KeysViewProps {
  entries: VaultKeyEntry[];
  onRefresh: () => Promise<void>;
  onOpenCreate: () => void;
  onOpenEdit: (entry: VaultKeyEntry) => void;
  onDelete: (entry: VaultKeyEntry) => void;
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  userEmail?: string;
}

const TYPE_CONFIG: Record<KeyType, { label: string; icon: any; badgeClass: string }> = {
  API_KEY: { label: 'API Key & Webhook', icon: Key, badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  TOKEN: { label: 'Bearer Token / JWT', icon: FileCode2, badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  SSH_KEY: { label: 'SSH Key & Servidor', icon: Terminal, badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  DATABASE: { label: 'Base de Datos / DSN', icon: Database, badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  PIN_CODE: { label: 'PIN Físico / Alarma', icon: Lock, badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  CERTIFICATE: { label: 'Certificado & Licencia', icon: Server, badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
};

const ENV_CONFIG: Record<Environment, { label: string; badgeClass: string }> = {
  PROD: { label: 'Producción', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  STAGING: { label: 'Staging', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  QA: { label: 'QA', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  DEV: { label: 'Desarrollo', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
};

export const KeysView: React.FC<KeysViewProps> = ({
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

  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedEnv, setSelectedEnv] = useState<string>('ALL');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
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
      api.keys.logAction(entryId, 'COPY', fieldName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast('No se pudo copiar al portapapeles.', 'error');
    }
  };

  const toggleSecretVisibility = (id: string) => {
    const isNowVisible = !visibleSecrets[id];
    setVisibleSecrets((prev) => ({ ...prev, [id]: isNowVisible }));
    if (isNowVisible) {
      api.keys.logAction(id, 'VIEW', 'secret');
    }
  };

  const handleToggleFavorite = async (entry: VaultKeyEntry) => {
    try {
      await api.keys.update(entry.id, { isFavorite: !entry.isFavorite });
      await onRefresh();
    } catch {
      showToast('Error al actualizar favorito.', 'error');
    }
  };

  const filteredEntries = entries.filter((entry) => {
    if (onlyFavorites && !entry.isFavorite) return false;
    if (selectedType !== 'ALL' && entry.keyType !== selectedType) return false;
    if (selectedEnv !== 'ALL' && entry.environment !== selectedEnv) return false;
    if (!searchTerm.trim()) return true;

    const q = searchTerm.toLowerCase();
    const matchTitle = entry.title?.toLowerCase().includes(q);
    const matchIdentifier = entry.identifier?.toLowerCase().includes(q);
    const matchCategory = entry.category?.toLowerCase().includes(q);
    const matchNotes = entry.notes?.toLowerCase().includes(q);
    const matchTags = entry.tags?.some((t) => t.toLowerCase().includes(q));

    return matchTitle || matchIdentifier || matchCategory || matchNotes || matchTags;
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

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight font-display">
              Llaves, Tokens y Secretos Técnicos
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
              {filteredEntries.length} de {entries.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            API Keys, Bearer Tokens, SSH Keys, PINs de acceso físico/alarma y credenciales de bases de datos.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Llave / Token</span>
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
            name="portal_keys_search_filter"
            id="portal_keys_search_filter"
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
            placeholder="Buscar por nombre, client ID, host, etiquetas, notas..."
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

        {/* Filtro por Tipo */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos los Tipos ({entries.length})</option>
            {Object.entries(TYPE_CONFIG).map(([typeKey, cfg]) => (
              <option key={typeKey} value={typeKey}>
                {cfg.label}
              </option>
            ))}
          </select>

          {/* Filtro por Entorno */}
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value)}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-semibold text-slate-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos los Entornos</option>
            {Object.entries(ENV_CONFIG).map(([envKey, cfg]) => (
              <option key={envKey} value={envKey}>
                {cfg.label}
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

      {/* Grid de Llaves y Tokens */}
      {filteredEntries.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto">
            <FileCode2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No se encontraron llaves ni tokens</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm || selectedType !== 'ALL' || selectedEnv !== 'ALL' || onlyFavorites
              ? 'Prueba modificando tus términos de búsqueda o filtros.'
              : 'Agrega tu primera llave técnica, token JWT o credencial de infraestructura.'}
          </p>
          {entries.length === 0 && (
            <button
              type="button"
              onClick={onOpenCreate}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Primera Llave</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredEntries.map((entry) => {
            const isSecretShown = Boolean(visibleSecrets[entry.id]);
            const typeCfg = TYPE_CONFIG[entry.keyType] || TYPE_CONFIG.API_KEY;
            const envCfg = ENV_CONFIG[entry.environment] || ENV_CONFIG.PROD;
            const Icon = typeCfg.icon;

            const isExpired = entry.expiresAt ? new Date(entry.expiresAt).getTime() < Date.now() : false;

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
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${typeCfg.badgeClass}`}
                          >
                            <Icon className="w-3 h-3" />
                            <span>{typeCfg.label}</span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${envCfg.badgeClass}`}
                          >
                            {envCfg.label}
                          </span>
                        </div>

                        {entry.identifier && (
                          <div className="mt-1 font-mono text-xs text-slate-400 truncate flex items-center gap-1.5">
                            <span className="text-slate-500">ID / Host:</span>
                            <span className="text-slate-200 select-all">{entry.identifier}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(entry.identifier, `id-${entry.id}`, entry.id, 'Identificador')}
                              className="text-slate-500 hover:text-indigo-400"
                            >
                              {copiedKey === `id-${entry.id}` ? (
                                <Check className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
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
                        title="Editar llave"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(entry)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Eliminar llave"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Secreto / Token Principal */}
                  <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                        Secreto / Clave / Token
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleSecretVisibility(entry.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors cursor-pointer"
                          title={isSecretShown ? 'Ocultar secreto' : 'Ver secreto'}
                        >
                          {isSecretShown ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.secret || '', `sec-${entry.id}`, entry.id, 'Secreto')}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-indigo-600/20 text-slate-400 hover:text-indigo-300 border border-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                          title="Copiar secreto al portapapeles"
                        >
                          {copiedKey === `sec-${entry.id}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 text-[11px]">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/60 font-mono text-xs break-all">
                      {isSecretShown ? (
                        <span className="text-white select-all">{entry.secret}</span>
                      ) : (
                        <span className="text-slate-500 tracking-widest">
                          {entry.secret ? '••••••••••••••••••••••••••••••••' : '—'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clave Pública / Certificado (si aplica) */}
                  {entry.publicKey && (
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/60 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-400">Clave Pública / Certificado</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(entry.publicKey || '', `pub-${entry.id}`, entry.id, 'Clave Pública')}
                          className="text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `pub-${entry.id}` ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copiar Pública</span>
                        </button>
                      </div>
                      <p className="font-mono text-[11px] text-slate-400 truncate bg-slate-900 p-2 rounded-lg">
                        {entry.publicKey}
                      </p>
                    </div>
                  )}

                  {/* Expiración y Notas Técnicas */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
                    {entry.expiresAt ? (
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                          isExpired
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {isExpired ? <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> : <Calendar className="w-3.5 h-3.5" />}
                        <span>
                          {isExpired
                            ? `Expiró el ${new Date(entry.expiresAt).toLocaleDateString('es-CL')}`
                            : `Vence el ${new Date(entry.expiresAt).toLocaleDateString('es-CL')}`}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">Sin fecha de expiración</span>
                    )}

                    <span className="text-[11px] text-slate-500">Categoría: {entry.category}</span>
                  </div>

                  {entry.notes && (
                    <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/40 text-xs text-slate-400">
                      <span className="block text-[10px] uppercase font-bold text-slate-500 mb-0.5">Instrucciones / Comandos:</span>
                      <p className="whitespace-pre-line leading-relaxed font-mono text-[11px]">{entry.notes}</p>
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
