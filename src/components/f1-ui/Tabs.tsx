import React, { useRef } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> { id: T; label: React.ReactNode; count?: number }

export interface TabsProps<T extends string> {
    items: TabItem<NoInfer<T>>[];
    value: T;
    onChange: (id: NoInfer<T>) => void;
    /** segment: vistas de un mismo contenido (2 a 4). underline: secciones de una ficha o página (D12). */
    variant?: 'segment' | 'underline';
    label: string;
    /** Identificador único del grupo; conecta las pestañas con su TabPanel. */
    id: string;
    className?: string;
}

/** Pestañas accesibles: role tablist, flechas, Inicio y Fin. El contenido va en <TabPanel tabsId value>. */
export function Tabs<T extends string>({ items, value, onChange, variant = 'segment', label, id: base, className }: TabsProps<T>) {
    const refs = useRef<Array<HTMLButtonElement | null>>([]);
    const move = (index: number) => { const next = items[(index + items.length) % items.length]; onChange(next.id); refs.current[(index + items.length) % items.length]?.focus(); };
    const onKey = (e: React.KeyboardEvent, i: number) => {
        const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: items.length - 1 }[e.key];
        if (target !== undefined) { e.preventDefault(); move(target); }
    };
    return (
        <div role="tablist" aria-label={label}
            className={cn(variant === 'segment' ? 'inline-flex max-w-full gap-1 overflow-x-auto overflow-y-hidden rounded-xl bg-neutral-soft p-1' : 'flex w-full gap-5 overflow-x-auto overflow-y-hidden border-b border-line', className)}>
            {items.map((item, i) => {
                const selected = item.id === value;
                return (
                    <button key={item.id} ref={el => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-tab-${item.id}`}
                        aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(item.id)} onKeyDown={e => onKey(e, i)}
                        className={cn('inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold transition-colors',
                            variant === 'segment'
                                ? cn('min-h-10 rounded-[9px] px-3.5', selected ? 'bg-surface text-brand shadow-sm' : 'text-fg-2 hover:text-fg')
                                : cn('-mb-px min-h-11 border-b-[3px] px-0.5', selected ? 'border-primary-500 text-brand' : 'border-transparent text-fg-2 hover:text-fg'))}>
                        {item.label}
                        {item.count !== undefined && <span className={cn('rounded-full px-1.5 text-xs', selected ? 'bg-brand-soft text-brand' : 'bg-neutral-soft text-neutral')}>{item.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

/** Contenido de la pestaña activa. */
export const TabPanel: React.FC<{ tabsId: string; value: string; className?: string; children: React.ReactNode }> = ({ tabsId, value, className, children }) => (
    <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-tab-${value}`} className={className}>{children}</div>
);
