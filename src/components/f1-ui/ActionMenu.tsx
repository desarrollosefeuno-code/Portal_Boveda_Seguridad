import React, { useEffect, useId, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from './cn';

export interface MenuAction {
    label: string;
    icon?: React.ElementType;
    onSelect: () => void;
    /** Eliminar y similares: en rojo, al final y separado (D5). */
    danger?: boolean;
    disabled?: boolean;
}

/**
 * Menú "⋯" para la tercera acción en adelante de una fila (D5).
 * Flechas para moverse, Escape o clic fuera para cerrar; el foco vuelve al botón.
 */
export const ActionMenu: React.FC<{ label: string; actions: MenuAction[]; className?: string }> = ({ label, actions, className }) => {
    const [open, setOpen] = useState(false);
    const menuId = useId();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const ordered = [...actions.filter(a => !a.danger), ...actions.filter(a => a.danger)];
    const firstDanger = ordered.findIndex(a => a.danger);

    useEffect(() => {
        if (!open) return;
        const items = () => [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])];
        items()[0]?.focus();
        const onDown = (e: MouseEvent) => {
            if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            const list = items();
            const i = list.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'Escape') { e.preventDefault(); setOpen(false); buttonRef.current?.focus(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
            else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
            else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
            else if (e.key === 'Tab') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    return (
        <span className={cn('relative inline-block', className)}>
            <IconButton ref={buttonRef} icon={MoreVertical} label={label} tip="Más acciones" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
                onClick={() => setOpen(o => !o)} />
            {open && (
                <div ref={menuRef} id={menuId} role="menu" aria-label={label}
                    className="animate-f1-scale absolute right-0 top-full z-30 mt-1 min-w-52 rounded-xl border border-line bg-surface p-1.5 text-left shadow-xl">
                    {ordered.map((action, i) => (
                        <React.Fragment key={action.label}>
                            {i === firstDanger && i > 0 && <div role="separator" className="my-1 border-t border-line" />}
                            <button type="button" role="menuitem" disabled={action.disabled}
                                onClick={() => { setOpen(false); buttonRef.current?.focus(); action.onSelect(); }}
                                className={cn('flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium hover:bg-hover focus-visible:bg-hover disabled:opacity-50 pointer-coarse:min-h-11',
                                    action.danger ? 'text-bad' : 'text-fg')}>
                                {action.icon && <action.icon size={16} className={action.danger ? 'text-bad' : 'text-fg-3'} aria-hidden="true" />}{action.label}
                            </button>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </span>
    );
};
