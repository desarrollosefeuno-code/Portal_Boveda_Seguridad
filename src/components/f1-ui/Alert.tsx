import React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from './cn';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'brand';

/** Clases de fondo, texto y borde por tono semántico; las comparten Alert y Badge. */
export const TONE: Record<Tone, string> = {
    ok: 'bg-ok-soft text-ok border-ok-line',
    warn: 'bg-warn-soft text-warn border-warn-line',
    bad: 'bg-bad-soft text-bad border-bad-line',
    info: 'bg-info-soft text-info border-info-line',
    neutral: 'bg-neutral-soft text-neutral border-neutral-line',
    brand: 'bg-brand-soft text-brand border-brand-line',
};
const ICON: Record<Tone, React.ElementType> = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info, neutral: Info, brand: Info };

/** Alerta en línea (D10): una condición que sigue vigente. Para el resultado de una acción, usa Toast. */
export const Alert: React.FC<{ tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string }> =
    ({ tone = 'info', title, children, action, className }) => {
        const Icon = ICON[tone];
        return (
            <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm', TONE[tone], className)}>
                <Icon size={18} className="mt-px flex-shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">{title && <p className="font-semibold">{title}</p>}{children}</div>
                {action && <div className="flex-shrink-0">{action}</div>}
            </div>
        );
    };
