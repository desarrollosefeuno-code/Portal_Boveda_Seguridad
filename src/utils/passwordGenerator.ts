export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const SETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // sin O ni I
  lowercase: 'abcdefghijkmnopqrstuvwxyz', // sin l
  numbers: '23456789', // sin 0 ni 1
  symbols: '!@#$%^&*_-+=?',
} as const;

/** Entero uniforme en [0, max) con CSPRNG y muestreo por rechazo (sin sesgo de módulo, B-01). */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

export function generatePassword(options: PasswordOptions): string {
  const chosen = (Object.keys(SETS) as Array<keyof typeof SETS>).filter((k) => options[k]);
  const groups = chosen.length ? chosen.map((k) => SETS[k]) : [SETS.lowercase, SETS.numbers];
  const charset = groups.join('');
  const length = Math.max(8, Math.min(64, Math.floor(options.length) || 18));

  // Un carácter de cada grupo elegido y el resto del conjunto completo
  const result = groups.map((g) => g[randomInt(g.length)]);
  while (result.length < length) result.push(charset[randomInt(charset.length)]);

  // Barajado Fisher–Yates con valores aleatorios propios
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

export interface PasswordStrength {
  score: number;
  label: string;
  tone: 'bad' | 'warn' | 'ok' | 'brand';
}

/** Estimación por entropía: largo × log2(tamaño del alfabeto usado). */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: 'Vacía', tone: 'bad' };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 32;
  const bits = password.length * Math.log2(Math.max(pool, 1));
  const score = Math.min(100, Math.round((bits / 100) * 100));
  if (bits < 50) return { score, label: `Débil · ${Math.round(bits)} bits`, tone: 'bad' };
  if (bits < 70) return { score, label: `Media · ${Math.round(bits)} bits`, tone: 'warn' };
  if (bits < 100) return { score, label: `Fuerte · ${Math.round(bits)} bits`, tone: 'ok' };
  return { score: 100, label: `Ultra-segura · ${Math.round(bits)} bits`, tone: 'brand' };
}
