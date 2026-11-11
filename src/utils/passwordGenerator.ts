export interface PasswordOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

export function generatePassword(options: PasswordOptions): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin caracteres confusos como O, I
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // sin l
  const digits = '23456789'; // sin 0, 1
  const syms = '!@#$%^&*_-+=?';

  let charset = '';
  const mandatory: string[] = [];

  if (options.uppercase) {
    charset += upper;
    mandatory.push(upper[Math.floor(Math.random() * upper.length)]);
  }
  if (options.lowercase) {
    charset += lower;
    mandatory.push(lower[Math.floor(Math.random() * lower.length)]);
  }
  if (options.numbers) {
    charset += digits;
    mandatory.push(digits[Math.floor(Math.random() * digits.length)]);
  }
  if (options.symbols) {
    charset += syms;
    mandatory.push(syms[Math.floor(Math.random() * syms.length)]);
  }

  if (!charset) {
    charset = lower + digits;
  }

  const length = Math.max(8, Math.min(64, options.length));
  const randomValues = new Uint32Array(length);

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomValues);
  } else {
    for (let i = 0; i < length; i++) {
      randomValues[i] = Math.floor(Math.random() * 1000000);
    }
  }

  const result: string[] = [...mandatory];
  for (let i = mandatory.length; i < length; i++) {
    result.push(charset[randomValues[i] % charset.length]);
  }

  // Barajar
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

export interface PasswordStrength {
  score: number; // 0 to 100
  label: string;
  colorClass: string;
  barClass: string;
}

export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, label: 'Vacía', colorClass: 'text-slate-400', barClass: 'bg-slate-700' };
  }

  let score = 0;
  if (password.length >= 8) score += 15;
  if (password.length >= 14) score += 20;
  if (password.length >= 18) score += 15;
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 15;

  score = Math.min(100, score);

  if (score < 40) {
    return { score, label: 'Débil', colorClass: 'text-red-400', barClass: 'bg-red-500' };
  }
  if (score < 70) {
    return { score, label: 'Media', colorClass: 'text-amber-400', barClass: 'bg-amber-500' };
  }
  if (score < 90) {
    return { score, label: 'Fuerte', colorClass: 'text-emerald-400', barClass: 'bg-emerald-500' };
  }
  return { score: 100, label: 'Ultra-Segura', colorClass: 'text-indigo-400', barClass: 'bg-indigo-500' };
}

