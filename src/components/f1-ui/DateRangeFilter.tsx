import React from 'react';
import { X } from 'lucide-react';
import { Field, Input } from './Field';
import { PRESET_LABEL, formatDate, presetRange, rangeError, type DatePreset, type DateRange } from './dates';
import { cn } from './cn';

const PRESETS: DatePreset[] = ['today', 'last7', 'thisMonth', 'lastMonth', 'thisYear', 'custom'];

/**
 * Filtro de periodo (D15): atajos y Desde / Hasta con el calendario del dispositivo.
 * Por defecto: listas del día a día en "Este mes"; reportes en "Mes anterior" (lo decide quien lo usa).
 */
export const DateRangeFilter: React.FC<{ value: DateRange; onChange: (range: DateRange) => void; maxDays?: number; className?: string }> = ({ value, onChange, maxDays, className }) => {
    const error = rangeError(value, maxDays);
    const pick = (preset: DatePreset) => onChange(preset === 'custom' ? { ...value, preset } : presetRange(preset));
    return (
        <div className={cn('grid gap-3', className)}>
            <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1.5">
                {PRESETS.map(preset => (
                    <button key={preset} type="button" aria-pressed={value.preset === preset} onClick={() => pick(preset)}
                        className={cn('min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors pointer-coarse:min-h-11',
                            value.preset === preset ? 'border-brand-line bg-brand-soft text-brand' : 'border-line-strong bg-surface text-fg-2 hover:bg-hover')}>
                        {PRESET_LABEL[preset]}
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-start gap-2.5">
                <Field label="Desde" className="w-full sm:w-48">{f => <Input {...f} type="date" value={value.from} max={value.to || undefined} onChange={e => onChange({ ...value, from: e.target.value, preset: 'custom' })} />}</Field>
                <Field label="Hasta" error={error} className="w-full sm:w-48">{f => <Input {...f} type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value, preset: 'custom' })} />}</Field>
            </div>
        </div>
    );
};

export type AppliedFilter = { id: string; label: React.ReactNode; onRemove: () => void };

/** Filtros aplicados como etiquetas con ×, cantidad de resultados y "Limpiar filtros" (D15). */
export const AppliedFilters: React.FC<{ filters: AppliedFilter[]; count: number; noun: string; onClear: () => void; className?: string }> = ({ filters, count, noun, onClear, className }) => (
    <div className={cn('flex flex-wrap items-center gap-1.5 text-[13px] text-fg-2', className)} aria-live="polite">
        <span>{count} {noun}{filters.length ? ' ·' : ''}</span>
        {filters.map(f => (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-neutral-line bg-neutral-soft py-0.5 pl-2.5 pr-1 font-semibold text-neutral">
                {f.label}
                <button type="button" onClick={f.onRemove} aria-label={`Quitar filtro ${typeof f.label === 'string' ? f.label : f.id}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-hover"><X size={14} aria-hidden="true" /></button>
            </span>
        ))}
        {filters.length > 0 && <button type="button" onClick={onClear} className="px-1 py-1.5 font-semibold text-brand underline underline-offset-2">Limpiar filtros</button>}
    </div>
);

/** Etiqueta de un periodo para AppliedFilters: "01-10-2026 → 28-10-2026". */
export const rangeLabel = (r: Pick<DateRange, 'from' | 'to'>) => `${formatDate(r.from) || '…'} → ${formatDate(r.to) || '…'}`;
