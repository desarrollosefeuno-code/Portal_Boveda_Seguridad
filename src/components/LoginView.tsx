import { useState, type FormEvent } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { Alert, Button, Field, Input } from './f1-ui';
import { api, errorMessage } from '../services/api';
import type { SessionUser } from '../types/vault';

export function LoginView({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y tu contraseña.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user } = await api.auth.login(email.trim(), password);
      setPassword('');
      onLogin(user);
    } catch (err) {
      setError(errorMessage(err, 'No fue posible iniciar sesión.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="animate-matrix-in w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="matrix-frame mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-brand">
            <ShieldCheck size={32} aria-hidden="true" />
          </span>
          <h1 className="matrix-glow matrix-caret text-2xl font-bold text-brand">F1 KeyVault</h1>
          <p className="mt-2 text-sm text-fg-2">Bóveda de contraseñas, llaves y secretos técnicos</p>
        </div>

        <form onSubmit={submit} noValidate className="matrix-frame grid gap-4 rounded-2xl border border-line bg-surface p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-fg-3">&gt; autenticación requerida</p>
          {error && <Alert tone="bad">{error}</Alert>}
          <Field label="Correo electrónico" required>
            {(f) => <Input {...f} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@f1.services" />}
          </Field>
          <Field label="Contraseña" required>
            {(f) => <Input {...f} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <Button type="submit" icon={LogIn} loading={loading} loadingText="Verificando…" className="w-full">
            Iniciar sesión
          </Button>
          <p className="text-center text-xs text-fg-3">Luego se pedirá tu PIN personal de 6 dígitos para abrir la bóveda.</p>
        </form>
      </div>
    </main>
  );
}
