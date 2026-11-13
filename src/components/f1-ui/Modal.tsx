import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { cn } from './cn';

const WIDTH = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-5xl' } as const;
// Modales abiertos, del más antiguo al más reciente: solo el de arriba responde a Escape y atrapa el foco
const openStack: symbol[] = [];
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    /** Nombre accesible cuando no hay título visible. */
    ariaLabel?: string;
    /** Línea bajo el título. */
    subtitle?: React.ReactNode;
    /** Ícono junto al título (en crema). */
    icon?: React.ReactNode;
    /** Relleno del contenido; '' cuando el contenido trae su propio relleno y pie. */
    bodyClassName?: string;
    /** sm 448 px (confirmaciones), md 672 px (formularios), lg 1024 px (detalle). */
    size?: keyof typeof WIDTH;
    /** Botones al pie: Cancelar a la izquierda, acción principal a la derecha. */
    footer?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

/**
 * Diálogo del estándar F1+ (D9). Escape y la X cierran; el foco entra, queda atrapado y vuelve a quien lo abrió.
 * En el celular aparece desde abajo, a todo el ancho. Se dibuja en <body> (portal) para quedar sobre el header,
 * el menú lateral y las barras fijas aunque un contenedor de la página cree su propia capa.
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, ariaLabel, subtitle, icon, bodyClassName = 'p-5', size = 'md', footer, children, className }) => {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const self = Symbol('modal');
        openStack.push(self);
        // Se enfoca el diálogo y no el primer campo: en el celular no se abre el teclado sin que la persona lo pida
        dialogRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (openStack[openStack.length - 1] !== self) return;
            if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
            if (e.key !== 'Tab') return;
            const list = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(el => el.offsetParent !== null);
            if (!list.length) return;
            const [head, tail] = [list[0], list[list.length - 1]];
            if (e.shiftKey && (document.activeElement === head || document.activeElement === dialogRef.current)) { e.preventDefault(); tail.focus(); }
            else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
        };
        window.addEventListener('keydown', onKey);
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            openStack.splice(openStack.indexOf(self), 1);
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
            opener?.focus?.();
        };
    }, [open]);

    if (!open || typeof document === 'undefined') return null;
    return createPortal(
        <div className="animate-f1-fade fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-4">
            <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : ariaLabel}
                className={cn('animate-f1-sheet sm:animate-f1-scale relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-2xl', WIDTH[size], className)}>
                {title ? (
                    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-line py-2 pl-5 pr-2">
                        <div className="flex min-w-0 items-center gap-3 py-1">
                            {icon && <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cream text-brand ring-1 ring-brand-line" aria-hidden="true">{icon}</span>}
                            <div className="min-w-0">
                                <h2 id={titleId} className="text-lg font-bold text-fg">{title}</h2>
                                {subtitle && <p className="text-[13px] text-fg-3">{subtitle}</p>}
                            </div>
                        </div>
                        <IconButton icon={X} label="Cerrar" tipSide="bottom" onClick={onClose} className="h-11 w-11" />
                    </div>
                ) : <IconButton icon={X} label="Cerrar" tipSide="bottom" onClick={onClose} className="absolute right-2 top-2 z-10 h-11 w-11" />}
                <div className={cn('min-h-0 flex-1 overflow-y-auto', bodyClassName)}>{children}</div>
                {footer && <div className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface-2 px-5 py-3.5 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
};
