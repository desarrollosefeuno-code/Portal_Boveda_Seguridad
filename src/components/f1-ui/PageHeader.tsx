import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from './cn';

export type PageStat = { label: string; value: React.ReactNode; warn?: boolean };

/**
 * Cabecera de sección (franja crema): ícono, título, qué es y cómo se usa, cifras y acciones.
 * El título de la página ya va en el header fijo; este bloque explica la sección.
 */
export const PageHeader: React.FC<{
    icon: React.ElementType; title: string; description: React.ReactNode; stats?: PageStat[];
    actions?: React.ReactNode; onBack?: () => void; backLabel?: string; className?: string;
}> = ({ icon: Icon, title, description, stats, actions, onBack, backLabel = 'Volver', className }) => (
    <div className={cn('grid gap-3', className)}>
        {onBack && (
            <button type="button" onClick={onBack} className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg font-semibold text-brand hover:underline">
                <ArrowLeft size={18} aria-hidden="true" />{backLabel}
            </button>
        )}
        <section className="rounded-2xl border border-brand-line bg-cream p-4 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-surface text-brand shadow-sm ring-1 ring-brand-line">
                        <Icon size={24} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-2xl font-bold text-fg">{title}</h2>
                        <p className="mt-1 max-w-2xl text-fg-2">{description}</p>
                    </div>
                </div>
                {actions && <div className="flex flex-shrink-0 flex-wrap gap-2">{actions}</div>}
            </div>
            {stats && stats.length > 0 && (
                <dl className="mt-4 flex flex-wrap gap-2">
                    {stats.map(stat => (
                        <div key={stat.label} className={cn('rounded-xl px-3 py-2 ring-1', stat.warn ? 'bg-warn-soft ring-warn-line' : 'bg-surface ring-brand-line')}>
                            <dt className={cn('text-xs', stat.warn ? 'text-warn' : 'text-fg-2')}>{stat.label}</dt>
                            <dd className={cn('font-display text-lg font-bold tabular-nums', stat.warn ? 'text-warn' : 'text-fg')}>{stat.value}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    </div>
);

/** Estado vacío (D12): ícono en crema, título, qué hacer y el botón que lo resuelve. */
export const EmptyState: React.FC<{ icon: React.ElementType; title: string; text: React.ReactNode; action?: React.ReactNode; className?: string }> =
    ({ icon: Icon, title, text, action, className }) => (
        <div className={cn('rounded-2xl border border-dashed border-line-strong bg-surface p-8 text-center', className)}>
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-cream text-brand"><Icon size={24} aria-hidden="true" /></span>
            <p className="font-semibold text-fg">{title}</p>
            <div className="mx-auto mt-1 max-w-md text-sm text-fg-2">{text}</div>
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
