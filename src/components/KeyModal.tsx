import { useEffect, useState, type FormEvent } from 'react';
import { Dices, Plus, Terminal, X } from 'lucide-react';
import { Alert, Button, CheckboxRow, F1Spinner, Field, IconButton, Input, Modal, Select, Textarea, useToast } from './f1-ui';
import { api, errorMessage } from '../services/api';
import type { Environment, KeyInput, KeyMeta, KeyType } from '../types/vault';
import { generatePassword } from '../utils/passwordGenerator';
import { newFieldId } from '../utils/secrets';

export const KEY_TYPE_LABEL: Record<KeyType, string> = {
  API_KEY: 'API key',
  TOKEN: 'Token',
  SSH_KEY: 'Llave SSH',
  DATABASE: 'Base de datos',
  PIN_CODE: 'PIN físico',
  CERTIFICATE: 'Certificado',
};

const ENV_LABEL: Record<Environment, string> = { PROD: 'Producción', STAGING: 'Staging', QA: 'QA', DEV: 'Desarrollo' };

interface ExtraRow {
  id: string;
  key: string;
  value: string;
}

interface FormState {
  title: string;
  keyType: KeyType;
  environment: Environment;
  category: string;
  identifier: string;
  secret: string;
  publicKey: string;
  notes: string;
  expiresAt: string;
  tags: string;
  isFavorite: boolean;
  extra: ExtraRow[];
}

const empty = (env: Environment): FormState => ({
  title: '', keyType: 'API_KEY', environment: env, category: 'General', identifier: '', secret: '', publicKey: '', notes: '', expiresAt: '', tags: '', isFavorite: false, extra: [],
});

export function KeyModal({ open, editing, allowedEnvironments, onClose, onSaved }: {
  open: boolean;
  editing: KeyMeta | null;
  allowedEnvironments: Environment[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const defaultEnv = allowedEnvironments[0] ?? 'DEV';
  const [form, setForm] = useState<FormState>(empty(defaultEnv));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowSecret(false);
    if (!editing) {
      setForm(empty(defaultEnv));
      return;
    }
    setLoading(true);
    api.keys
      .reveal(editing.id, 'EDIT')
      .then((s) =>
        setForm({
          title: editing.title,
          keyType: editing.keyType,
          environment: editing.environment,
          category: editing.category,
          identifier: editing.identifier,
          secret: s.secret,
          publicKey: editing.publicKey,
          notes: s.notes,
          expiresAt: editing.expiresAt ?? '',
          tags: editing.tags.join(', '),
          isFavorite: editing.isFavorite,
          extra: Object.entries(s.additionalData).map(([key, value]) => ({ id: newFieldId(), key, value })),
        })
      )
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [open, editing, defaultEnv]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('El nombre es obligatorio.');
    if (!form.secret) return setError('El secreto es obligatorio.');
    const keys = form.extra.map((x) => x.key.trim()).filter(Boolean);
    if (new Set(keys).size !== keys.length) return setError('Los nombres de los datos adicionales no se pueden repetir.');

    const payload: KeyInput = {
      title: form.title.trim(),
      keyType: form.keyType,
      environment: form.environment,
      category: form.category.trim() || 'General',
      identifier: form.identifier.trim() || null,
      secret: form.secret,
      publicKey: form.publicKey.trim() || null,
      notes: form.notes.trim() || null,
      expiresAt: form.expiresAt || null,
      isFavorite: form.isFavorite,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      additionalData: Object.fromEntries(form.extra.filter((x) => x.key.trim()).map((x) => [x.key.trim(), x.value])),
      ...(editing ? { version: editing.version } : {}),
    };
    setSaving(true);
    setError(null);
    try {
      const res = editing ? await api.keys.update(editing.id, payload) : await api.keys.create(payload);
      toast.success(res.message || 'Guardado.');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const multiline = form.keyType === 'SSH_KEY' || form.keyType === 'CERTIFICATE';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar llave' : 'Nueva llave o token'}
      subtitle="Se cifra con AES-256-GCM antes de guardarse"
      icon={<Terminal size={20} />}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="key-form" loading={saving} loadingText="Cifrando…" disabled={loading}>
            {editing ? 'Guardar cambios' : 'Guardar llave'}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-10"><F1Spinner size="sm" text="Descifrando registro…" /></div>
      ) : (
        <form id="key-form" onSubmit={submit} className="grid gap-4" noValidate autoComplete="off">
          {error && <Alert tone="bad">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" required className="sm:col-span-2">
              {(f) => <Input {...f} value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} placeholder="Token API de facturación" />}
            </Field>
            <Field label="Tipo">
              {(f) => (
                <Select {...f} value={form.keyType} onChange={(e) => set('keyType', e.target.value as KeyType)}>
                  {(Object.keys(KEY_TYPE_LABEL) as KeyType[]).map((t) => <option key={t} value={t}>{KEY_TYPE_LABEL[t]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Entorno">
              {(f) => (
                <Select {...f} value={form.environment} onChange={(e) => set('environment', e.target.value as Environment)}>
                  {allowedEnvironments.map((env) => <option key={env} value={env}>{ENV_LABEL[env]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Categoría">
              {(f) => <Input {...f} value={form.category} maxLength={80} onChange={(e) => set('category', e.target.value)} />}
            </Field>
            <Field label="Identificador" help="Usuario, ID de cliente, host o nombre de la llave.">
              {(f) => <Input {...f} className="font-mono" value={form.identifier} maxLength={500} onChange={(e) => set('identifier', e.target.value)} />}
            </Field>
          </div>

          <Field label="Secreto" required>
            {(f) =>
              multiline ? (
                <Textarea {...f} rows={6} className="font-mono text-xs" spellCheck={false} value={form.secret} maxLength={50000} onChange={(e) => set('secret', e.target.value)}
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
              ) : (
                <div className="flex gap-2">
                  <Input {...f} type={showSecret ? 'text' : 'password'} autoComplete="new-password" className="font-mono" value={form.secret} maxLength={50000} onChange={(e) => set('secret', e.target.value)} />
                  <Button variant="secondary" onClick={() => setShowSecret(!showSecret)} aria-pressed={showSecret}>{showSecret ? 'Ocultar' : 'Ver'}</Button>
                  <IconButton label="Generar un valor aleatorio" icon={Dices} onClick={() => {
                    set('secret', generatePassword({ length: 32, uppercase: true, lowercase: true, numbers: true, symbols: false }));
                    setShowSecret(true);
                  }} />
                </div>
              )
            }
          </Field>

          {multiline && (
            <Field label="Clave pública o certificado" help="No es secreto: se guarda sin cifrar para poder copiarla sin abrir la llave.">
              {(f) => <Textarea {...f} rows={3} className="font-mono text-xs" spellCheck={false} value={form.publicKey} maxLength={50000} onChange={(e) => set('publicKey', e.target.value)} />}
            </Field>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium text-fg">Datos adicionales (cifrados)</legend>
            {form.extra.map((row, i) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto] sm:items-center">
                <Input aria-label={`Nombre del dato ${i + 1}`} placeholder="Ej.: región" value={row.key} maxLength={100}
                  onChange={(e) => set('extra', form.extra.map((x) => (x.id === row.id ? { ...x, key: e.target.value } : x)))} />
                <Input aria-label={`Valor del dato ${i + 1}`} className="font-mono" autoComplete="off" value={row.value} maxLength={5000}
                  onChange={(e) => set('extra', form.extra.map((x) => (x.id === row.id ? { ...x, value: e.target.value } : x)))} />
                <IconButton label={`Quitar dato ${i + 1}`} icon={X} tone="danger" onClick={() => set('extra', form.extra.filter((x) => x.id !== row.id))} />
              </div>
            ))}
            <Button variant="ghost" icon={Plus} className="w-fit" disabled={form.extra.length >= 50}
              onClick={() => set('extra', [...form.extra, { id: newFieldId(), key: '', value: '' }])}>
              Agregar dato
            </Button>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vence el" help="Aviso cuando falten 30 días o menos.">
              {(f) => <Input {...f} type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />}
            </Field>
            <Field label="Etiquetas" help="Separadas por coma.">
              {(f) => <Input {...f} value={form.tags} onChange={(e) => set('tags', e.target.value)} />}
            </Field>
          </div>
          <Field label="Notas seguras">
            {(f) => <Textarea {...f} rows={3} value={form.notes} maxLength={20000} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
          <CheckboxRow label="Marcar como favorito" checked={form.isFavorite} onChange={(e) => set('isFavorite', e.target.checked)} />
        </form>
      )}
    </Modal>
  );
}
