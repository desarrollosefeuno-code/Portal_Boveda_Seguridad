import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from './f1-ui';

/**
 * Seis casillas para el PIN. Cada casilla es `password` con `one-time-code` para que el navegador
 * no ofrezca autocompletar el correo ni guarde el PIN.
 */
export function PinInput({ value, onChange, onComplete, disabled, label, invalid, autoFocus }: {
  value: string;
  onChange: (pin: string) => void;
  onComplete?: (pin: string) => void;
  disabled?: boolean;
  label: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // Valor más reciente: los dígitos pueden llegar más rápido que el re-render (escritura veloz o autocompletado del SO)
  const latest = useRef(value);
  latest.current = value;
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  /** Escribe uno o varios dígitos desde la casilla `index` y mueve el foco a la siguiente libre. */
  const setAt = (index: number, typed: string) => {
    const clean = typed.replace(/\D/g, '');
    const current = latest.current.padEnd(6, ' ').split('');
    if (!clean) current[index] = ' ';
    clean.split('').forEach((d, k) => {
      if (index + k < 6) current[index + k] = d;
    });
    const next = current.join('').replace(/ +$/, '').replace(/ /g, '').slice(0, 6);
    latest.current = next;
    onChange(next);
    if (clean) refs.current[Math.min(index + clean.length, 5)]?.focus();
    if (next.length === 6 && clean) onComplete?.(next);
  };

  const onKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault();
      onChange(latest.current.slice(0, index - 1));
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < 5) refs.current[index + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) onComplete?.(pasted);
  };

  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-fg">{label}</legend>
      <div className="flex justify-center gap-2 sm:gap-3" onPaste={onPaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus={autoFocus && i === 0}
            aria-label={`Dígito ${i + 1} de 6`}
            aria-invalid={invalid || undefined}
            value={digit}
            onChange={(e) => setAt(i, e.target.value.replace(digit, '') || e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            onFocus={(e) => e.target.select()}
            className={cn(
              'h-14 w-11 rounded-xl border bg-surface-2 text-center text-2xl font-bold text-brand transition-colors sm:h-16 sm:w-13',
              'focus:border-primary-500 focus:outline-none focus:ring-3 focus:ring-primary-500/30 disabled:opacity-50',
              invalid ? 'border-bad' : digit ? 'border-brand-line matrix-glow' : 'border-line-strong'
            )}
          />
        ))}
      </div>
    </fieldset>
  );
}
