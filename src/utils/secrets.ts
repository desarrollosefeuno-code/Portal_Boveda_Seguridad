/** Tiempo que un secreto queda visible en pantalla o en el portapapeles (M-06). */
export const SECRET_TTL_MS = 30_000;

let clipboardTimer: number | undefined;

/**
 * Copia al portapapeles y lo vacía a los 30 s. No se puede comprobar si el usuario copió otra cosa
 * entretanto (la lectura del portapapeles está bloqueada por Permissions-Policy), así que se vacía igual.
 */
export async function copySecret(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  window.clearTimeout(clipboardTimer);
  clipboardTimer = window.setTimeout(() => {
    navigator.clipboard.writeText('').catch(() => {});
  }, SECRET_TTL_MS);
}

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const formatDate = (isoDate: string | null | undefined) => {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

/** Días hasta una fecha aaaa-mm-dd (negativo si ya pasó). */
export function daysUntil(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
}

export const newFieldId = () => crypto.randomUUID().slice(0, 8);

/** Normaliza una URL para abrirla: solo http/https. */
export function safeHref(url: string): string | null {
  const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
