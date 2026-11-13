import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Lock, LockKeyhole, Timer } from 'lucide-react';
import { Alert, Button, Field, Input } from './f1-ui';
import { PinInput } from './PinInput';
import { api, ApiError, errorMessage } from '../services/api';
import type { VaultStatus } from '../types/vault';

/**
 * Puerta de la bóveda: define el PIN personal la primera vez (con la contraseña de la cuenta)
 * o lo pide para desbloquear. El bloqueo por intentos es de cada usuario.
 */
export function VaultGate({ status, onUnlocked, onRefresh }: { status: VaultStatus | null; onUnlocked: () => void; onRefresh: () => void }) {
  if (!status) return null;
  return (
    <div className="relative z-10 mx-auto flex w-full max-w-lg flex-col items-center px-4 py-10">
      <div className="animate-matrix-in matrix-frame w-full rounded-2xl border border-line bg-surface p-6 sm:p-8">
        {status.hasPin ? <Unlock status={status} onUnlocked={onUnlocked} onRefresh={onRefresh} /> : <SetupPin onUnlocked={onUnlocked} />}
      </div>
    </div>
  );
}

function Header({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div className="mb-6 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand-line">
        <Icon size={28} aria-hidden="true" />
      </span>
      <h2 className="matrix-glow text-xl font-bold text-brand">{title}</h2>
      <p className="mt-2 text-sm text-fg-2">{text}</p>
    </div>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000)) : 0;
}

function Unlock({ status, onUnlocked, onRefresh }: { status: VaultStatus; onUnlocked: () => void; onRefresh: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(status.isLockedOut ? status.lockedUntil : null);
  const seconds = useCountdown(lockedUntil);

  useEffect(() => {
    if (lockedUntil && seconds === 0) {
      setLockedUntil(null);
      setError(null);
      onRefresh();
    }
  }, [seconds, lockedUntil, onRefresh]);

  const submit = async (value = pin) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.vault.unlock(value);
      onUnlocked();
    } catch (err) {
      setPin('');
      setError(errorMessage(err, 'No se pudo desbloquear.'));
      if (err instanceof ApiError && err.code === 'VAULT_LOCKOUT') setLockedUntil(err.data?.lockedUntil ?? null);
    } finally {
      setBusy(false);
    }
  };

  if (lockedUntil && seconds > 0) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return (
      <>
        <Header icon={Timer} title="Bóveda bloqueada" text="Se superó el número de intentos con tu PIN. Solo tu bóveda está bloqueada; el resto del equipo no se ve afectado." />
        <p className="matrix-glow text-center text-4xl font-bold tabular-nums text-warn" role="timer" aria-live="off">{mm}:{ss}</p>
        <p className="mt-3 text-center text-sm text-fg-3">Si olvidaste tu PIN, pide a un administrador que lo resetee.</p>
      </>
    );
  }

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-5"
    >
      <Header icon={LockKeyhole} title="Bóveda bloqueada" text="Ingresa tu PIN personal de 6 dígitos para ver y gestionar los secretos." />
      {error && <Alert tone="bad">{error}</Alert>}
      <PinInput label="PIN personal" value={pin} onChange={setPin} onComplete={submit} disabled={busy} invalid={!!error} autoFocus />
      <p className="text-center text-xs text-fg-3">Intentos disponibles: {status.remainingAttempts} de {status.maxAttempts}</p>
      <Button type="submit" icon={KeyRound} loading={busy} loadingText="Verificando…" disabled={pin.length !== 6} className="w-full">
        Desbloquear
      </Button>
    </form>
  );
}

function SetupPin({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pin.length !== 6) return setError('El PIN debe tener 6 dígitos.');
    if (pin !== confirm) return setError('Los dos PIN no coinciden.');
    if (!password) return setError('Ingresa la contraseña de tu cuenta.');
    setBusy(true);
    setError(null);
    try {
      await api.vault.setupPin(password, pin);
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err, 'No se pudo crear el PIN.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      <Header icon={Lock} title="Crea tu PIN personal" text="Es solo tuyo: no lo compartas. Lo pedirá la bóveda cada vez que se bloquee. Evita secuencias y repeticiones (123456, 111111, 121212)." />
      {error && <Alert tone="bad">{error}</Alert>}
      <PinInput label="Nuevo PIN" value={pin} onChange={setPin} autoFocus />
      <PinInput label="Repite el PIN" value={confirm} onChange={setConfirm} invalid={confirm.length === 6 && confirm !== pin} />
      <Field label="Contraseña de tu cuenta" help="Confirma que eres tú antes de crear el PIN." required>
        {(f) => <Input {...f} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" icon={KeyRound} loading={busy} loadingText="Guardando…" className="w-full">
        Crear PIN y abrir la bóveda
      </Button>
    </form>
  );
}
