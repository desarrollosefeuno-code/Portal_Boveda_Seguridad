import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  Sparkles,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Lock,
  Globe,
  User as UserIcon,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import type { VaultPasswordEntry, VaultAdditionalField } from '../types/vault.js';
import {
  generatePassword,
  calculatePasswordStrength,
  type PasswordOptions,
} from '../utils/passwordGenerator.js';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<VaultPasswordEntry>) => Promise<void>;
  editingEntry?: VaultPasswordEntry | null;
  categories: string[];
}

const COMMON_CATEGORIES = [
  'General',
  'Portales Clientes',
  'Sistemas Internos',
  'Servicios Nube & Hosting',
  'Finanzas & Bancos',
  'Correos & Comunicaciones',
  'Redes & Telecomunicaciones',
  'Bases de Datos & ERP',
];

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingEntry,
  categories,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [additionalFields, setAdditionalFields] = useState<VaultAdditionalField[]>([]);

  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genOptions, setGenOptions] = useState<PasswordOptions>({
    length: 18,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (editingEntry) {
      setTitle(editingEntry.title || '');
      setCategory(editingEntry.category || 'General');
      setUrl(editingEntry.url || '');
      setUsername(editingEntry.username || '');
      setPassword(editingEntry.password || '');
      setNotes(editingEntry.notes || '');
      setIsFavorite(Boolean(editingEntry.isFavorite));
      setTagsInput(editingEntry.tags?.join(', ') || '');
      setAdditionalFields(editingEntry.additionalFields || []);
    } else {
      setTitle('');
      setCategory('General');
      setUrl('');
      setUsername('');
      setPassword('');
      setNotes('');
      setIsFavorite(false);
      setTagsInput('');
      setAdditionalFields([]);
    }
    setErrorMessage(null);
    setShowGenerator(false);
  }, [editingEntry, isOpen]);

  if (!isOpen) return null;

  const strength = calculatePasswordStrength(password);

  const handleGenerate = () => {
    const generated = generatePassword(genOptions);
    setPassword(generated);
  };

  const handleAddField = () => {
    setAdditionalFields([
      ...additionalFields,
      { id: Math.random().toString(36).slice(2, 9), key: '', value: '', isSecret: false },
    ]);
  };

  const handleRemoveField = (id: string) => {
    setAdditionalFields(additionalFields.filter((f) => f.id !== id));
  };

  const handleFieldChange = (id: string, prop: keyof VaultAdditionalField, val: any) => {
    setAdditionalFields(
      additionalFields.map((f) => (f.id === id ? { ...f, [prop]: val } : f))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('El nombre o título del portal es obligatorio.');
      return;
    }
    if (!password.trim() && !editingEntry) {
      setErrorMessage('La contraseña es obligatoria.');
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
        category,
        url: url.trim() || undefined,
        username: username.trim() || undefined,
        password: password.trim() || undefined,
        notes: notes.trim() || undefined,
        isFavorite,
        tags: cleanTags,
        additionalFields: additionalFields.filter((f) => f.key.trim() && f.value.trim()),
      });
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al guardar la credencial.');
    } finally {
      setIsSaving(false);
    }
  };

  const allCategories = Array.from(new Set([...COMMON_CATEGORIES, ...categories])).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Cabecera */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white font-display">
                {editingEntry ? 'Editar Credencial de Portal' : 'Nueva Credencial de Portal'}
              </h3>
              <p className="text-xs text-slate-400">
                La contraseña y campos adicionales se cifran con AES-256-GCM.
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Nombre del Portal o Sistema *
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Portal Clientes Entel, Consola AWS, Correo Corporativo..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Categoría
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                URL del Portal Web
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="https://portal.cliente.cl"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Usuario / Correo / Login
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="admin@empresa.cl o usuario_red"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Contraseña Principal y Generador */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Contraseña Principal *
                </label>
                <button
                  type="button"
                  onClick={() => setShowGenerator(!showGenerator)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generar Contraseña Segura</span>
                </button>
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required={!editingEntry}
                  placeholder="Ingresa o genera una contraseña..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Medidor de Fortaleza */}
              {password && (
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Fortaleza:</span>
                    <span className={`font-bold ${strength.colorClass}`}>{strength.label}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${strength.barClass}`}
                      style={{ width: `${strength.score}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Panel de Generador */}
              {showGenerator && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-indigo-500/30 space-y-3 mt-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Longitud: {genOptions.length} caracteres</span>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer transition-all"
                    >
                      Generar Ahora
                    </button>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={40}
                    value={genOptions.length}
                    onChange={(e) => setGenOptions({ ...genOptions, length: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={genOptions.uppercase}
                        onChange={(e) => setGenOptions({ ...genOptions, uppercase: e.target.checked })}
                        className="rounded accent-indigo-500"
                      />
                      <span>Mayúsculas</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={genOptions.lowercase}
                        onChange={(e) => setGenOptions({ ...genOptions, lowercase: e.target.checked })}
                        className="rounded accent-indigo-500"
                      />
                      <span>Minúsculas</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={genOptions.numbers}
                        onChange={(e) => setGenOptions({ ...genOptions, numbers: e.target.checked })}
                        className="rounded accent-indigo-500"
                      />
                      <span>Números</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={genOptions.symbols}
                        onChange={(e) => setGenOptions({ ...genOptions, symbols: e.target.checked })}
                        className="rounded accent-indigo-500"
                      />
                      <span>Símbolos</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Campos Adicionales */}
            <div className="sm:col-span-2 space-y-2 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Campos Adicionales Dinámicos
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    RUT Empresa, PIN secundario, Clave de respaldo, Pregunta secreta, etc.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="inline-flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Campo</span>
                </button>
              </div>

              <div className="space-y-2">
                {additionalFields.map((field) => (
                  <div key={field.id} className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                    <input
                      type="text"
                      placeholder="Nombre (ej: RUT)"
                      value={field.key}
                      onChange={(e) => handleFieldChange(field.id, 'key', e.target.value)}
                      className="w-1/3 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white"
                    />
                    <input
                      type={field.isSecret ? 'password' : 'text'}
                      placeholder="Valor del campo..."
                      value={field.value}
                      onChange={(e) => handleFieldChange(field.id, 'value', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={field.isSecret}
                        onChange={(e) => handleFieldChange(field.id, 'isSecret', e.target.checked)}
                        className="rounded accent-indigo-500"
                      />
                      <span>Ocultar</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveField(field.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Notas Seguras */}
            <div className="sm:col-span-2 space-y-1.5 pt-2 border-t border-slate-800">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Notas Seguras / Instrucciones de Acceso
              </label>
              <textarea
                rows={3}
                placeholder="Instrucciones especiales para iniciar sesión, horario de expiración, responsables..."
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
                  placeholder="ej: produccion, prioritario, facturacion"
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
              {isSaving ? 'Guardando...' : editingEntry ? 'Guardar Cambios' : 'Crear Credencial'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
