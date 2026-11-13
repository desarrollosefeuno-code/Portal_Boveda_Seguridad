import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, ShieldAlert, UserRound } from 'lucide-react';
import { Alert, Button, Field, Input, Modal, SwitchRow, Tabs, TabPanel, useToast } from './f1-ui';
import { PinInput } from './PinInput';
import { api, errorMessage } from '../services/api';
import type { SessionUser } from '../types/vault';

const PASSWORD_HELP = 'Mínimo 12 caracteres. Una frase larga es más segura que una clave corta con símbolos.';

function ChangePasswordForm({ onDone, submitLabel = 'Cambiar contraseña' }: { onDone: () => void; submitLabel?: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 12) return setError('La nueva contraseña debe tener al menos 12 caracteres.');
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden.');
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.changePassword(current, next);
      toast.success(res.message || 'Contraseña actualizada.');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error && <Alert tone="bad">{error}</Alert>}
      <Field label="Contraseña actual" required>
        {(f) => <Input {...f} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="Nueva contraseña" help={PASSWORD_HELP} required>
        {(f) => <Input {...f} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Repite la nueva contraseña" required error={repeat && repeat !== next ? 'No coincide con la nueva contraseña.' : null}>
        {(f) => <Input {...f} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
      </Field>
      <Button type="submit" icon={KeyRound} loading={busy} loadingText="Guardando…">{submitLabel}</Button>
    </form>
  );
}

/** Pantalla obligatoria tras una contraseña temporal o publicada (C-04). */
export function ForcedPasswordChange({ user, onDone, onLogout }: { user: SessionUser; onDone: () => void; onLogout: () => void }) {
  return (
    <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-10">
      <div className="animate-matrix-in matrix-frame grid gap-5 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-soft text-warn ring-1 ring-warn-line">
            <ShieldAlert size={28} aria-hidden="true" />
          </span>
          <h2 className="matrix-glow text-xl font-bold text-brand">Cambia tu contraseña</h2>
          <p className="mt-2 text-sm text-fg-2">
            {user.email} tiene una contraseña temporal o insegura. Debes reemplazarla antes de usar la bóveda.
          </p>
        </div>
        <ChangePasswordForm onDone={onDone} submitLabel="Guardar y continuar" />
        <Button variant="secondary" icon={LogOut} onClick={onLogout}>Cerrar sesión</Button>
      </div>
    </div>
  );
}

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (current.length !== 6 || next.length !== 6) return setError('Completa los 6 dígitos de cada PIN.');
    if (next !== repeat) return setError('Los PIN nuevos no coinciden.');
    setBusy(true);
    setError(null);
    try {
      await api.vault.changePin(current, next);
      toast.success('PIN actualizado.');
      onDone();
    } catch (err) {
      setCurrent('');
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {error && <Alert tone="bad">{error}</Alert>}
      <PinInput label="PIN actual" value={current} onChange={setCurrent} />
      <PinInput label="Nuevo PIN" value={next} onChange={setNext} />
      <PinInput label="Repite el nuevo PIN" value={repeat} onChange={setRepeat} invalid={repeat.length === 6 && repeat !== next} />
      <p className="text-xs text-fg-3">Los intentos fallidos cuentan para el bloqueo de tu bóveda.</p>
      <Button type="submit" icon={KeyRound} loading={busy} loadingText="Guardando…">Cambiar PIN</Button>
    </form>
  );
}

type AccountTab = 'profile' | 'password' | 'pin';

export function AccountModal({ open, onClose, user, onUserChanged, vaultUnlocked, rain, onRainChange }: {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  onUserChanged: () => void;
  vaultUnlocked: boolean;
  rain: boolean;
  onRainChange: (on: boolean) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<AccountTab>('profile');
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.auth.updateProfile(name);
      toast.success('Nombre actualizado.');
      onUserChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mi cuenta" subtitle={user.email} icon={<UserRound size={20} />} size="md">
      <div className="grid gap-5">
        <Tabs<AccountTab>
          id="account"
          label="Secciones de mi cuenta"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'profile', label: 'Perfil' },
            { id: 'password', label: 'Contraseña' },
            { id: 'pin', label: 'PIN' },
          ]}
        />
        <TabPanel tabsId="account" value={tab}>
          {tab === 'profile' && (
          <form onSubmit={saveName} className="grid gap-4">
            <Field label="Nombre visible" required>
              {(f) => <Input {...f} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Button type="submit" loading={busy} loadingText="Guardando…" disabled={!name.trim() || name === user.name}>Guardar nombre</Button>
            <SwitchRow
              title="Lluvia de caracteres"
              description="Animación de fondo del tema Matrix. Se desactiva sola si tu equipo pide reducir el movimiento."
              checked={rain}
              onChange={onRainChange}
              onText="Activa"
              offText="Apagada"
            />
          </form>
          )}
          {tab === 'password' && <ChangePasswordForm onDone={onClose} />}
          {tab === 'pin' && (vaultUnlocked ? <ChangePinForm onDone={onClose} /> : <Alert tone="info">Desbloquea la bóveda para cambiar tu PIN.</Alert>)}
        </TabPanel>
      </div>
    </Modal>
  );
}
