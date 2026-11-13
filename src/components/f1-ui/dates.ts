/**
 * Fechas del estándar F1+ (D15): se guardan como aaaa-mm-dd y se muestran como dd-mm-aaaa.
 * Siempre la fecha local (Chile), nunca UTC: toISOString() adelanta el día después de las 21:00.
 */
const pad = (n: number) => String(n).padStart(2, '0');

export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayLocal = () => toIsoDate(new Date());

/** "2026-10-28" → "28-10-2026". Devuelve el texto tal cual si no es una fecha ISO. */
export const formatDate = (iso: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso ?? '');
};

/** Fecha y hora en 24 horas: "28-10-2026 09:18". */
export const formatDateTime = (value: string | Date) => {
    const d = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(d.getTime()) ? '' : `${formatDate(toIsoDate(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export type DatePreset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
export type DateRange = { from: string; to: string; preset: DatePreset };

export const PRESET_LABEL: Record<DatePreset, string> = {
    today: 'Hoy', last7: 'Últimos 7 días', thisMonth: 'Este mes', lastMonth: 'Mes anterior', thisYear: 'Este año', custom: 'Personalizado',
};

/** Rango de un atajo, calculado desde `now` (fecha local). */
export function presetRange(preset: Exclude<DatePreset, 'custom'>, now = new Date()): DateRange {
    const y = now.getFullYear(), m = now.getMonth();
    const today = toIsoDate(now);
    switch (preset) {
        case 'today': return { from: today, to: today, preset };
        case 'last7': return { from: toIsoDate(new Date(y, m, now.getDate() - 6)), to: today, preset };
        case 'thisMonth': return { from: toIsoDate(new Date(y, m, 1)), to: today, preset };
        case 'lastMonth': return { from: toIsoDate(new Date(y, m - 1, 1)), to: toIsoDate(new Date(y, m, 0)), preset };
        case 'thisYear': return { from: toIsoDate(new Date(y, 0, 1)), to: today, preset };
    }
}

/** Mensaje de error del rango, o null si es válido. maxDays limita reportes pesados. */
export function rangeError(range: Pick<DateRange, 'from' | 'to'>, maxDays?: number): string | null {
    if (!range.from || !range.to) return null;
    if (range.to < range.from) return `"Hasta" no puede ser anterior a "Desde" (${formatDate(range.from)}).`;
    if (maxDays) {
        const days = (Date.parse(`${range.to}T00:00:00`) - Date.parse(`${range.from}T00:00:00`)) / 86_400_000;
        if (days > maxDays) return `El periodo no puede superar ${maxDays} días. Acórtalo o divide la consulta.`;
    }
    return null;
}

/** ¿La fecha ISO (o su prefijo aaaa-mm-dd) cae en el rango? */
export const inRange = (iso: string | null | undefined, range: Pick<DateRange, 'from' | 'to'>) => {
    const day = (iso ?? '').slice(0, 10);
    return !!day && (!range.from || day >= range.from) && (!range.to || day <= range.to);
};
