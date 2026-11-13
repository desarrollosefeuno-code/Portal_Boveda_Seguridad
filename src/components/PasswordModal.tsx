import { useEffect, useState, type FormEvent } from 'react';
import { Dices, Globe, Plus, X } from 'lucide-react';
import { Alert, Button, CheckboxRow, F1Spinner, Field, IconButton, Input, Modal, Textarea, useToast } from './f1-ui';
import { api, ApiError, errorMessage } from '../services/api';
import type { PasswordInput, PasswordMeta, VaultAdditionalField } from '../types/vault';
import { calculatePasswordStrength, generatePassword } from '../utils/passwordGenerator';
import { newFieldId } from '../utils/secrets';
import { StrengthMeter } from './StrengthMeter';

const CATEGORIES = ['General', 'Correo', 'SaaS', 'Clientes', 'Bancos', 'Proveedores', 'Infraestructura', 'Redes sociales'];

interface FormState {
  title: string;
  category: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  tags: string;
  isFavorite: boolean;
  fields: VaultAdditionalField[];
}

const EMPTY: FormState = { title: '', category: 'General', url: '', username: '', password: '', notes: '', tags: '', isFavorite: false, fields: [] };

export function PasswordModal({ open, editing, onClose, onSaved }: { open: boolean; editing: PasswordMeta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [length, setLength] = useState(20);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPassword(false);
    if (!editing) {
      setForm(EMPTY);
      return;
    }
    // Al editar se descifra el registro con propósito EDIT (queda en la bitácora)
    setLoading(true);
    api.passwords
      .reveal(editing.id, 'EDIT')
      .then((s) =>
        setForm({
          title: editing.title,
          category: editing.category,
          url: editing.url,
          username: editing.username,
          password: s.password,
          notes: s.notes,
          tags: editing.tags.join(', '),
          isFavorite: editing.isFavorite,
          fields: s.additionalFields,
        })
      )
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('El título es obligatorio.');
    if (!form.password) return setError('La contraseña es obligatoria.');
    const payload: PasswordInput = {
      title: form.title.trim(),
      category: form.category.trim() || 'General',
      url: form.url.trim() || null,
      username: form.username.trim() || null,
      password: form.password,
      notes: form.notes.trim() || null,
      isFavorite: form.isFavorite,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      additionalFields: form.fields.filter((f) => f.key.trim() && f.value.trim()),
      ...(editing ? { version: editing.version } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const res = editing ? await api.passwords.update(editing.id, payload) : await api.passwords.create(payload);
      toast.success(res.message || 'Guardado.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'VERSION_CONFLICT' ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const strength = calculatePasswordStrength(form.password);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar credencial' : 'Nueva credencial'}
      subtitle="Se cifra con AES-256-GCM antes de guardarse"
      icon={<Globe size={20} />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="password-form" loading={saving} loadingText="Cifrando…" disabled={loading}>
            {editing ? 'Guardar cambios' : 'Guardar credencial'}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-10"><F1Spinner size="sm" text="Descifrando registro…" /></div>
      ) : (
        <form id="password-form" onSubmit={submit} className="grid gap-4" noValidate autoComplete="off">
          {error && <Alert tone="bad">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" required>
              {(f) => <Input {...f} value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Portal de proveedor X" />}
            </Field>
            <Field label="Categoría">
              {(f) => (
                <>
                  <Input {...f} list="pw-categories" value={form.category} maxLength={80} onChange={(e) => set('category', e.target.value)} />
                  <datalist id="pw-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
                </>
              )}
            </Field>
            <Field label="URL de acceso">
              {(f) => <Input {...f} type="url" inputMode="url" value={form.url} maxLength={2048} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />}
            </Field>
            <Field label="Usuario o correo">
              {(f) => <Input {...f} name="vault-entry-user" autoComplete="off" value={form.username} maxLength={320} onChange={(e) => set('username', e.target.value)} />}
            </Field>
          </div>

          <Field label="Contraseña" required help={<StrengthMeter strength={strength} />}>
            {(f) => (
              <div className="flex gap-2">
                <Input {...f} type={showPassword ? 'text' : 'password'} autoComplete="new-password" className="font-mono" value={form.password} maxLength={10000} onChange={(e) => set('password', e.target.value)} />
                <Button variant="secondary" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword}>{showPassword ? 'Ocultar' : 'Ver'}</Button>
              </div>
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <Field label="Largo" className="w-28">
              {(f) => <Input {...f} type="number" min={8} max={64} value={length} onChange={(e) => setLength(Number(e.target.value))} />}
            </Field>
            <Button
              variant="secondary"
              icon={Dices}
              onClick={() => {
                set('password', generatePassword({ length, uppercase: true, lowercase: true, numbers: true, symbols: true }));
                setShowPassword(true);
              }}
            >
              Generar contraseña segura
            </Button>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">Datos adicionales</legend>
            {form.fields.map((field, i) => (
              <div key={field.id} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                <Input aria-label={`Nombre del dato ${i + 1}`} placeholder="Ej.: RUT empresa" value={field.key} maxLength={100}
                  onChange={(e) => set('fields', form.fields.map((x) => (x.id === field.id ? { ...x, key: e.target.value } : x)))} />
                <Input aria-label={`Valor del dato ${i + 1}`} type={field.isSecret ? 'password' : 'text'} autoComplete="off" value={field.value} maxLength={5000}
                  onChange={(e) => set('fields', form.fields.map((x) => (x.id === field.id ? { ...x, value: e.target.value } : x)))} />
                <div className="flex items-center gap-2">
                  <CheckboxRow label="Oculto" checked={field.isSecret} onChange={(e) => set('fields', form.fields.map((x) => (x.id === field.id ? { ...x, isSecret: e.target.checked } : x)))} />
                  <IconButton label={`Quitar dato ${i + 1}`} icon={X} tone="danger" onClick={() => set('fields', form.fields.filter((x) => x.id !== field.id))} />
                </div>
              </div>
            ))}
            <Button variant="ghost" icon={Plus} className="w-fit" disabled={form.fields.length >= 50}
              onClick={() => set('fields', [...form.fields, { id: newFieldId(), key: '', value: '', isSecret: false }])}>
              Agregar dato
            </Button>
          </fieldset>

          <Field label="Notas seguras" help="Se cifran igual que la contraseña.">
            {(f) => <Textarea {...f} rows={3} value={form.notes} maxLength={20000} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
          <Field label="Etiquetas" help="Separadas por coma. Máximo 20.">
            {(f) => <Input {...f} value={form.tags} onChange={(e) => set('tags', e.target.value)} placeholder="finanzas, chile" />}
          </Field>
          <CheckboxRow label="Marcar como favorito" checked={form.isFavorite} onChange={(e) => set('isFavorite', e.target.checked)} />
        </form>
      )}
    </Modal>
  );
}
