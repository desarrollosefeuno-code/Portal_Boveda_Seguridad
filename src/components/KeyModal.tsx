import React, { useState, useEffect } from 'react';
import {
  X,
  FileCode2,
  Lock,
  Calendar,
  Sparkles,
  Eye,
  EyeOff,
  Server,
  Key,
  Database,
  Terminal,
} from 'lucide-react';
import type { VaultKeyEntry, KeyType, Environment } from '../types/vault.js';
import { generatePassword } from '../utils/passwordGenerator.js';

interface KeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<VaultKeyEntry>) => Promise<void>;
  editingEntry?: VaultKeyEntry | null;
}

const KEY_TYPES: { id: KeyType; label: string; icon: any; color: string }[] = [
  { id: 'API_KEY', label: 'API Key & Webhook', icon: Key, color: 'text-amber-400 bg-amber-500/10' },
  { id: 'TOKEN', label: 'Bearer Token / JWT', icon: FileCode2, color: 'text-indigo-400 bg-indigo-500/10' },
  { id: 'SSH_KEY', label: 'SSH Key & Servidor', icon: Terminal, color: 'text-emerald-400 bg-emerald-500/10' },
  { id: 'DATABASE', label: 'Base de Datos / DSN', icon: Database, color: 'text-rose-400 bg-rose-500/10' },
  { id: 'PIN_CODE', label: 'PIN Físico / Alarma', icon: Lock, color: 'text-cyan-400 bg-cyan-500/10' },
  { id: 'CERTIFICATE', label: 'Certificado & Licencia', icon: Server, color: 'text-violet-400 bg-violet-500/10' },
];

const ENVIRONMENTS: { id: Environment; label: string; badgeClass: string }[] = [
  { id: 'PROD', label: 'Producción', badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { id: 'STAGING', label: 'Staging / Pre-prod', badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { id: 'QA', label: 'QA / Pruebas', badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { id: 'DEV', label: 'Desarrollo', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
];

export const KeyModal: React.FC<KeyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEntry,
}) => {
  const [title, setTitle] = useState('');
  const [keyType, setKeyType] = useState<KeyType>('API_KEY');
  const [environment, setEnvironment] = useState<Environment>('PROD');
  const [category, setCategory] = useState('Infraestructura');
  const [identifier, setIdentifier] = useState('');
  const [secret, setSecret] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [notes, setNotes] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [tagsInput, setTagsInput] = useState('');

  const [showSecret, setShowSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingEntry) {
      setTitle(editingEntry.title || '');
      setKeyType(editingEntry.keyType || 'API_KEY');
      setEnvironment(editingEntry.environment || 'PROD');
      setCategory(editingEntry.category || 'Infraestructura');
      setIdentifier(editingEntry.identifier || '');
      setSecret(editingEntry.secret || '');
      setPublicKey(editingEntry.publicKey || '');
      setNotes(editingEntry.notes || '');
      setExpiresAt(editingEntry.expiresAt ? editingEntry.expiresAt.split('T')[0] : '');
      setIsFavorite(Boolean(editingEntry.isFavorite));
      setTagsInput(editingEntry.tags?.join(', ') || '');
    } else {
      setTitle('');
      setKeyType('API_KEY');
      setEnvironment('PROD');
      setCategory('Infraestructura');
      setIdentifier('');
      setSecret('');
      setPublicKey('');
      setNotes('');
      setExpiresAt('');
      setIsFavorite(false);
      setTagsInput('');
    }
    setErrorMessage(null);
  }, [editingEntry, isOpen]);

  if (!isOpen) return null;

  const handleGenerateSecret = () => {
    const generated = generatePassword({
      length: 32,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });
    setSecret(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('El nombre o descripción de la llave es obligatorio.');
      return;
    }
    if (!secret.trim() && !editingEntry) {
      setErrorMessage('El secreto o token principal es obligatorio.');
      return;
    }

    const cleanTags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSave({
        title: title.trim(),
        keyType,
        environment,
        category: category.trim(),
        identifier: identifier.trim() || undefined,
        secret: secret.trim() || undefined,
        publicKey: publicKey.trim() || undefined,
        notes: notes.trim() || undefined,
        expiresAt: expiresAt || null,
        isFavorite,
        tags: cleanTags,
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al guardar la llave o token.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <FileCode2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                {editingEntry ? 'Editar Llave o Token' : 'Nueva Llave / Token Técnico'}
              </h3>
              <p className="text-xs text-slate-400">
                Almacena credenciales de integración, APIs y certificados con cifrado AES-256-GCM.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Selector de Tipo de Llave */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
              Tipo de Llave o Secreto *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {KEY_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = keyType === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setKeyType(t.id)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-left ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Nombre de la Llave / Servicio *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: API Gateway Producción, Token NetSuite REST, Clave SSH Bastion Central..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Entorno */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Entorno de Ejecución
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ENVIRONMENTS.map((env) => (
                  <button
                    key={env.id}
                    type="button"
                    onClick={() => setEnvironment(env.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      environment === env.id
                        ? env.badgeClass
                        : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {env.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Categoría / Área
              </label>
              <input
                type="text"
                placeholder="Ej: Infraestructura, Finanzas, Redes, Pasarelas..."
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Identificador / Client ID / Usuario SSH */}
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Identificador / Client ID / Host / Usuario
              </label>
              <input
                type="text"
                placeholder="Ej: client_id_10928, ubuntu@10.0.1.20, api.empresa.cl/v1"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Secreto Principal */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Secreto / Token / Llave Privada *
                </label>
                <button
                  type="button"
                  onClick={handleGenerateSecret}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generar Secreto Seguro (32 chars)</span>
                </button>
              </div>

              <div className="relative">
                <textarea
                  rows={keyType === 'SSH_KEY' || keyType === 'CERTIFICATE' ? 5 : 2}
                  required={!editingEntry}
                  placeholder="Pega aquí el Token JWT, API Key, Clave Privada SSH o secreto..."
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-3 text-slate-500 hover:text-slate-300 p-1"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Clave Pública (opcional, para SSH o certificados) */}
            {(keyType === 'SSH_KEY' || keyType === 'CERTIFICATE') && (
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Clave Pública / Certificado Público (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC... o -----BEGIN CERTIFICATE-----"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {/* Fecha de Expiración */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Fecha de Expiración / Renovación
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Notas Técnicas */}
            <div className="sm:col-span-2 space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Notas Técnicas / Comandos de Conexión
              </label>
              <textarea
                rows={2}
                placeholder="Ej: ssh -i key.pem user@host, header Authorization: Bearer <token>, restricciones de IP..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Etiquetas y Favorito */}
            <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                  Etiquetas (separadas por coma)
                </label>
                <input
                  type="text"
                  placeholder="ej: webhook, netsuite, aws, pasarela"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-3 sm:pt-0">
                <input
                  type="checkbox"
                  checked={isFavorite}
                  onChange={(e) => setIsFavorite(e.target.checked)}
                  className="rounded accent-indigo-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-white">Marcar como Favorito</span>
              </label>
            </div>
          </div>

          {/* Botones de acción */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Guardando...' : editingEntry ? 'Guardar Cambios' : 'Crear Llave / Token'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
