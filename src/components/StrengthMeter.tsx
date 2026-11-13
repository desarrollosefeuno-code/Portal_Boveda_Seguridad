import { cn } from './f1-ui';
import type { PasswordStrength } from '../utils/passwordGenerator';

const BAR: Record<PasswordStrength['tone'], string> = { bad: 'bg-bad', warn: 'bg-warn', ok: 'bg-ok', brand: 'bg-brand' };
const TEXT: Record<PasswordStrength['tone'], string> = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok', brand: 'text-brand' };

export function StrengthMeter({ strength }: { strength: PasswordStrength }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={strength.score} aria-label="Fortaleza de la contraseña">
        <span className={cn('block h-full rounded-full transition-all', BAR[strength.tone])} style={{ width: `${strength.score}%` }} />
      </span>
      <span className={cn('text-xs font-semibold', TEXT[strength.tone])}>{strength.label}</span>
    </span>
  );
}
