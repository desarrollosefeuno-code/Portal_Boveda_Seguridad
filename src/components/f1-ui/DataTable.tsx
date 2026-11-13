import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from 'lucide-react';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { EmptyState } from './PageHeader';
import { cn } from './cn';

export interface Column<T> {
    id: string;
    header: string;
    cell: (row: T) => React.ReactNode;
    /** Valor para ordenar; si falta, la columna no se ordena. */
    sortValue?: (row: T) => string | number | null | undefined;
    /** Montos y cantidades: a la derecha, con cifras de ancho fijo. */
    numeric?: boolean;
    className?: string;
}

export interface DataTableProps<T> {
    rows: T[];
    columns: Column<T>[];
    rowId: (row: T) => string;
    /** Nombre de lo que lista, en plural: "solicitudes". */
    noun: string;
    /** Columna de acciones (D5): IconButton y ActionMenu, alineados a la derecha. */
    actions?: (row: T) => React.ReactNode;
    /** Tarjeta para pantallas angostas (bajo 720 px). Sin ella, la tabla se desplaza de lado. */
    mobileCard?: (row: T) => React.ReactNode;
    /** Ancho bajo el cual se usan las tarjetas: 720 (teléfono, por defecto) o 1024 (también tablet, para tablas muy anchas). */
    cardBreakpoint?: 720 | 1024;
    pageSize?: number;
    initialSort?: { column: string; direction: 'asc' | 'desc' };
    /** Selección de filas (D16). */
    selected?: Set<string>;
    onSelectedChange?: (selected: Set<string>) => void;
    /** Barra de acciones masivas cuando hay filas elegidas. */
    bulkActions?: (selected: Set<string>) => React.ReactNode;
    toolbar?: React.ReactNode;
    empty?: React.ReactNode;
    caption: string;
    className?: string;
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

/** Tabla del estándar F1+ (D6): encabezado grafito fijo, orden accesible, 25 filas por página y tarjetas en el celular. */
export function DataTable<T>({ rows, columns, rowId, noun, actions, mobileCard, cardBreakpoint = 720, pageSize = 25, initialSort, selected, onSelectedChange, bulkActions, toolbar, empty, caption, className }: DataTableProps<T>) {
    const [sort, setSort] = useState(initialSort);
    const [page, setPage] = useState(0);

    const sorted = useMemo(() => {
        const column = columns.find(c => c.id === sort?.column);
        if (!column?.sortValue || !sort) return rows;
        const value = column.sortValue;
        const factor = sort.direction === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const [x, y] = [value(a), value(b)];
            if (x == null || x === '') return 1;
            if (y == null || y === '') return -1;
            return factor * (typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y)));
        });
    }, [rows, columns, sort]);

    const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    useEffect(() => { if (page >= pages) setPage(pages - 1); }, [page, pages]);
    const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

    const selectable = !!selected && !!onSelectedChange;
    const visibleIds = visible.map(rowId);
    const chosenOnPage = selectable ? visibleIds.filter(id => selected!.has(id)).length : 0;
    const toggle = (id: string) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); onSelectedChange!(next); };
    const togglePage = () => {
        const next = new Set(selected);
        if (chosenOnPage === visibleIds.length) visibleIds.forEach(id => next.delete(id)); else visibleIds.forEach(id => next.add(id));
        onSelectedChange!(next);
    };
    const onSort = (column: Column<T>) => {
        setSort(prev => prev?.column === column.id ? { column: column.id, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { column: column.id, direction: column.numeric ? 'desc' : 'asc' });
        setPage(0);
    };

    if (!rows.length) return <>{toolbar}{empty ?? <EmptyState icon={Inbox} title={`Aún no hay ${noun}`} text="Cuando existan, aparecerán aquí." />}</>;

    const from = page * pageSize + 1;
    const to = Math.min(sorted.length, (page + 1) * pageSize);
    return (
        <div className={cn('grid gap-2', className)}>
            {selectable && selected!.size > 0 && bulkActions && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-support-line bg-support-soft px-3 py-2 text-sm font-semibold text-support-fg">
                    <span>{selected!.size} {selected!.size === 1 ? 'seleccionada' : 'seleccionadas'}</span>
                    <span className="flex flex-wrap gap-2">{bulkActions(selected!)}</span>
                </div>
            )}
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {toolbar && <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-3.5 py-3">{toolbar}</div>}
                <div className={cn('overflow-x-auto', mobileCard && (cardBreakpoint === 1024 ? 'max-[1023px]:hidden' : 'max-[719px]:hidden'))}>
                    <table className="w-full border-collapse text-sm">
                        <caption className="sr-only">{caption}</caption>
                        <thead>
                            <tr>
                                {selectable && (
                                    <th scope="col" className="sticky top-0 w-12 bg-thead px-4 py-2.5">
                                        <Checkbox checked={chosenOnPage > 0 && chosenOnPage === visibleIds.length} indeterminate={chosenOnPage > 0 && chosenOnPage < visibleIds.length}
                                            onChange={togglePage} aria-label={`Seleccionar todas las ${noun} de esta página`} />
                                    </th>
                                )}
                                {columns.map(column => {
                                    const active = sort?.column === column.id;
                                    const SortIcon = !active ? ArrowUpDown : sort!.direction === 'asc' ? ArrowUp : ArrowDown;
                                    return (
                                        <th key={column.id} scope="col" aria-sort={column.sortValue ? (active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                                            className={cn('sticky top-0 whitespace-nowrap bg-thead p-0 text-xs font-semibold uppercase tracking-wide text-white', column.numeric ? 'text-right' : 'text-left')}>
                                            {column.sortValue ? (
                                                <button type="button" onClick={() => onSort(column)} className={cn('flex w-full items-center gap-1.5 px-4 py-2.5 uppercase hover:bg-thead-hover', column.numeric && 'justify-end')}>
                                                    {column.header}<SortIcon size={14} className={active ? 'text-primary-200' : 'text-white/60'} aria-hidden="true" />
                                                </button>
                                            ) : <span className="block px-4 py-2.5">{column.header}</span>}
                                        </th>
                                    );
                                })}
                                {actions && <th scope="col" className="sticky top-0 bg-thead px-4 py-2.5"><span className="sr-only">Acciones</span></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map(row => {
                                const id = rowId(row);
                                const isSelected = selectable && selected!.has(id);
                                return (
                                    <tr key={id} className={cn('border-t border-line-soft', isSelected ? 'bg-support-soft' : 'hover:bg-hover')}>
                                        {selectable && <td className="px-4 py-3"><Checkbox checked={isSelected} onChange={() => toggle(id)} aria-label={`Seleccionar ${id}`} /></td>}
                                        {columns.map(column => (
                                            <td key={column.id} className={cn('px-4 py-3 align-middle text-fg', column.numeric && 'text-right tabular-nums', column.className)}>{column.cell(row)}</td>
                                        ))}
                                        {actions && <td className="whitespace-nowrap px-3 py-2 text-right">{actions(row)}</td>}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {mobileCard && (
                    <ul className={cardBreakpoint === 1024 ? 'min-[1024px]:hidden' : 'min-[720px]:hidden'} aria-label={caption}>
                        {visible.map(row => <li key={rowId(row)} className="grid gap-2 border-t border-line p-3.5 first:border-t-0">{mobileCard(row)}</li>)}
                    </ul>
                )}
                {sorted.length > pageSize && (
                    <nav aria-label={`Páginas de ${noun}`} className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line px-3.5 py-2.5 text-[13px] text-fg-2">
                        <span>{from}–{to} de {sorted.length} {noun}</span>
                        <span className="flex items-center gap-1.5">
                            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                            <span className="px-1.5 tabular-nums">Página {page + 1} de {pages}</span>
                            <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                        </span>
                    </nav>
                )}
            </div>
        </div>
    );
}
