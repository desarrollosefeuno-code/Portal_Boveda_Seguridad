import React, { useEffect, useRef } from 'react';
import { cn } from './cn';

const BOX = cn(
    'peer grid h-5 w-5 flex-shrink-0 cursor-pointer appearance-none place-content-center rounded-md border-2 border-line-strong bg-surface transition-colors',
    'checked:border-action checked:bg-action indeterminate:border-action indeterminate:bg-action disabled:cursor-not-allowed disabled:opacity-45',
    "before:content-[''] checked:before:h-[5px] checked:before:w-2.5 checked:before:-translate-y-px checked:before:-rotate-45 checked:before:border-b-[2.5px] checked:before:border-l-[2.5px] checked:before:border-white",
    'indeterminate:before:h-[2.5px] indeterminate:before:w-2.5 indeterminate:before:rounded-sm indeterminate:before:bg-white',
);

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    /** Algunas filas elegidas (raya). */
    indeterminate?: boolean;
}

/** Casilla sola (D16), por ejemplo en tablas. Necesita aria-label si no tiene etiqueta visible. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ indeterminate = false, className, ...props }, ref) => {
    const inner = useRef<HTMLInputElement | null>(null);
    useEffect(() => { if (inner.current) inner.current.indeterminate = indeterminate; }, [indeterminate]);
    return <input ref={el => { inner.current = el; if (typeof ref === 'function') ref(el); else if (ref) ref.current = el; }} type="checkbox" className={cn(BOX, className)} {...props} />;
});
Checkbox.displayName = 'Checkbox';

/** Casilla con su texto (D16): toda la fila responde al toque (44 px). */
export const CheckboxRow: React.FC<CheckboxProps & { label: React.ReactNode; description?: React.ReactNode }> = ({ label, description, className, ...props }) => (
    <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 hover:bg-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:bg-transparent', className)}>
        <Checkbox {...props} />
        <span className="min-w-0 text-[15px] text-fg">{label}{description && <span className="block text-[13px] text-fg-3">{description}</span>}</span>
    </label>
);

/** Grupo de casillas con título (fieldset y legend). */
export const CheckboxGroup: React.FC<{ legend: React.ReactNode; children: React.ReactNode; className?: string }> = ({ legend, children, className }) => (
    <fieldset className={cn('grid min-w-0 gap-0.5', className)}>
        <legend className="pb-1.5 text-sm font-semibold text-fg">{legend}</legend>
        {children}
    </fieldset>
);
