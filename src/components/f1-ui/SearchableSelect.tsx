import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { controlClasses } from './Field';
import { cn } from './cn';

export type SelectOption = { value: string; label: string; description?: string; disabled?: boolean };

interface BaseProps {
    options: SelectOption[];
    placeholder?: string;
    /** Permite usar lo escrito como opción nueva ("Usar … como nuevo"). */
    onCreate?: (text: string) => void;
    noResultsText?: string;
    /** Del Field: id, aria-describedby, aria-invalid, required. */
    id?: string;
    describedBy?: string;
    invalid?: boolean;
    required?: boolean;
    disabled?: boolean;
    className?: string;
}
type SingleProps = BaseProps & { multiple?: false; value: string | null; onChange: (value: string | null) => void };
type MultiProps = BaseProps & { multiple: true; value: string[]; onChange: (value: string[]) => void };

const LIST_MAX = 288;
type Place = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

/** Ubica la lista junto al campo: abajo si cabe, arriba si hay más espacio, y nunca fuera de la ventana. */
function placeList(anchor: DOMRect): Place {
    const gap = 6, margin = 8;
    const below = window.innerHeight - anchor.bottom - gap - margin;
    const above = anchor.top - gap - margin;
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - anchor.width - margin));
    if (below >= Math.min(LIST_MAX, 200) || below >= above) return { left, width: anchor.width, top: anchor.bottom + gap, maxHeight: Math.max(120, Math.min(LIST_MAX, below)) };
    return { left, width: anchor.width, bottom: window.innerHeight - anchor.top + gap, maxHeight: Math.max(120, Math.min(LIST_MAX, above)) };
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Lista con buscador (D7): más de 10 opciones, creación opcional y selección múltiple con etiquetas.
 * Patrón combobox: flechas, Enter, Escape; la opción activa se resalta en crema.
 * La lista se dibuja en <body> con posición fija: dentro de un modal o un contenedor con scroll no lo agranda
 * ni queda recortada, y se abre hacia arriba cuando abajo no hay espacio.
 */
export function SearchableSelect(props: SingleProps | MultiProps) {
    const { options, placeholder = 'Selecciona…', onCreate, noResultsText = 'Sin coincidencias', id, describedBy, invalid, required, disabled, className } = props;
    const listId = useId();
    const optionId = (i: number) => `${listId}-opt-${i}`;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [place, setPlace] = useState<Place | null>(null);

    const chosen = props.multiple ? props.value : props.value ? [props.value] : [];
    const labelOf = (value: string) => options.find(o => o.value === value)?.label ?? value;
    const filtered = useMemo(() => {
        const q = normalize(query.trim());
        return q ? options.filter(o => normalize(`${o.label} ${o.description ?? ''}`).includes(q)) : options;
    }, [options, query]);
    const canCreate = !!onCreate && !!query.trim() && !options.some(o => normalize(o.label) === normalize(query.trim()));
    const total = filtered.length + (canCreate ? 1 : 0);

    useEffect(() => { setActive(0); }, [query, open]);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) { setOpen(false); setQuery(''); }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    // Posición de la lista: se recalcula al abrir, al desplazar cualquier contenedor y al cambiar el tamaño de la ventana
    useLayoutEffect(() => {
        if (!open) { setPlace(null); return; }
        const update = () => { if (rootRef.current) setPlace(placeList(rootRef.current.getBoundingClientRect())); };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
    }, [open, chosen.length]);
    useEffect(() => {
        if (!open || !listRef.current) return;
        const option = document.getElementById(optionId(active));
        if (!option) return;
        // Solo se desplaza la lista (no la página ni el modal)
        const list = listRef.current;
        if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop - 6;
        else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight + 6;
    });

    const choose = (value: string) => {
        if (props.multiple) props.onChange(props.value.includes(value) ? props.value.filter(v => v !== value) : [...props.value, value]);
        else { (props as SingleProps).onChange(value); setOpen(false); }
        setQuery('');
    };
    const commit = (i: number) => {
        if (i < filtered.length) { if (!filtered[i].disabled) choose(filtered[i].value); }
        else if (canCreate) { onCreate!(query.trim()); setQuery(''); if (!props.multiple) setOpen(false); }
    };
    const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setActive(a => Math.min(total - 1, a + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
        else if (e.key === 'Enter' && open && total) { e.preventDefault(); commit(active); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }
        else if (e.key === 'Backspace' && !query && props.multiple && props.value.length) props.onChange(props.value.slice(0, -1));
    };

    const singleValue = props.multiple ? null : (props as SingleProps).value;
    const singleLabel = singleValue ? labelOf(singleValue) : '';
    return (
        <div ref={rootRef} className={cn('relative min-w-0', className)}>
            <div className={controlClasses(invalid, cn('flex flex-wrap items-center gap-1.5 py-1.5 pr-9 focus-within:border-primary-500 focus-within:ring-3 focus-within:ring-primary-500/20', disabled && 'cursor-not-allowed bg-surface-2'))}
                onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus(); } }}>
                {props.multiple && props.value.map(v => (
                    <span key={v} className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-soft py-0.5 pl-2.5 pr-1 text-[13px] font-semibold text-brand">
                        {labelOf(v)}
                        <button type="button" disabled={disabled} onClick={e => { e.stopPropagation(); choose(v); }} aria-label={`Quitar ${labelOf(v)}`} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface"><X size={13} aria-hidden="true" /></button>
                    </span>
                ))}
                <input ref={inputRef} id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open && total ? optionId(active) : undefined}
                    aria-describedby={describedBy} aria-invalid={invalid || undefined} aria-required={required || undefined} disabled={disabled} autoComplete="off"
                    value={open ? query : singleLabel} placeholder={chosen.length && props.multiple ? 'Agregar…' : placeholder}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
                    className="min-w-24 flex-1 bg-transparent py-1 text-[15px] text-fg outline-none placeholder:text-fg-3 disabled:cursor-not-allowed" />
            </div>
            {singleValue && !disabled ? (
                <button type="button" onClick={() => (props as SingleProps).onChange(null)} aria-label={`Quitar ${singleLabel}`} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-fg-3 hover:bg-hover hover:text-fg"><X size={16} aria-hidden="true" /></button>
            ) : <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-fg-3" aria-hidden="true" />}
            {open && place && typeof document !== 'undefined' && createPortal(
                <ul ref={listRef} id={listId} role="listbox" aria-multiselectable={props.multiple || undefined}
                    style={{ position: 'fixed', left: place.left, width: place.width, top: place.top, bottom: place.bottom, maxHeight: place.maxHeight }}
                    className="animate-f1-scale z-[60] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                    {filtered.map((option, i) => {
                        const isChosen = chosen.includes(option.value);
                        return (
                            <li key={option.value} id={optionId(i)} role="option" aria-selected={isChosen} aria-disabled={option.disabled || undefined}
                                onMouseDown={e => e.preventDefault()} onClick={() => commit(i)} onMouseEnter={() => setActive(i)}
                                className={cn('flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm pointer-coarse:min-h-11',
                                    i === active && 'bg-brand-soft', isChosen ? 'font-semibold text-brand' : 'text-fg', option.disabled && 'cursor-not-allowed opacity-50')}>
                                <span className="min-w-0">{option.label}{option.description && <span className="block text-xs font-normal text-fg-3">{option.description}</span>}</span>
                                {isChosen && <Check size={16} className="flex-shrink-0" aria-hidden="true" />}
                            </li>
                        );
                    })}
                    {canCreate && (
                        <li id={optionId(filtered.length)} role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => commit(filtered.length)} onMouseEnter={() => setActive(filtered.length)}
                            className={cn('mt-1 flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border-t border-line px-2.5 py-2 text-sm font-semibold text-brand', active === filtered.length && 'bg-brand-soft')}>
                            <Plus size={16} aria-hidden="true" />Usar "{query.trim()}" como nuevo
                        </li>
                    )}
                    {!total && <li className="px-2.5 py-3 text-sm text-fg-3">{noResultsText}</li>}
                </ul>,
                document.body,
            )}
        </div>
    );
}
