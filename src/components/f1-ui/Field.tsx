import React, { useId } from 'react';
import { Search } from 'lucide-react';
import { cn } from './cn';

/** Clases de un campo (D8): 44 px, borde gris, foco naranja con halo suave, borde rojo con error. */
export const controlClasses = (invalid?: boolean, className?: string) => cn(
    'block min-h-11 w-full rounded-xl border bg-surface px-3.5 text-[15px] text-fg placeholder:text-fg-3 transition-colors',
    'focus:border-primary-500 focus:outline-none focus:ring-3 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3',
    invalid ? 'border-bad' : 'border-line-strong', className);

/**
 * Flecha de la lista (D7). Va como estilo en línea y no como clase `bg-[url(...)]`: Tailwind no genera esa
 * clase porque el escape de las comillas en el código no coincide con la clase real, y la lista quedaba sin flecha.
 */
const CHEVRON_STYLE: React.CSSProperties = {
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundSize: '16px',
    backgroundPosition: 'right 14px center',
    backgroundRepeat: 'no-repeat',
};

interface FieldContext { id: string; describedBy?: string; invalid: boolean; required?: boolean }

export interface FieldProps {
    label: React.ReactNode;
    /** Texto de ayuda bajo el campo. */
    help?: React.ReactNode;
    /** Error que dice qué corregir; conecta aria-invalid y aria-describedby. */
    error?: string | null;
    required?: boolean;
    /** Oculta la etiqueta visualmente (sigue disponible para lectores de pantalla). */
    hideLabel?: boolean;
    className?: string;
    children: (field: FieldContext) => React.ReactNode;
}

/**
 * Campo con etiqueta conectada, ayuda y error (D8):
 * <Field label="Nombre" required error={e}>{f => <Input {...f} value={v} onChange={…} />}</Field>
 */
export const Field: React.FC<FieldProps> = ({ label, help, error, required, hideLabel, className, children }) => {
    const id = useId();
    const helpId = help ? `${id}-help` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
    return (
        <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
            <label htmlFor={id} className={cn('text-sm font-medium text-fg', hideLabel && 'sr-only')}>
                {label}{required && <span className="ml-0.5 text-bad" aria-hidden="true">*</span>}
            </label>
            {children({ id, describedBy, invalid: !!error, required })}
            {error && <p id={errorId} className="text-[13px] font-medium text-bad">{error}</p>}
            {help && <p id={helpId} className="text-[13px] text-fg-3">{help}</p>}
        </div>
    );
};

type Ctx = Partial<FieldContext>;
const aria = ({ id, describedBy, invalid, required }: Ctx) => ({ id, 'aria-describedby': describedBy, 'aria-invalid': invalid || undefined, required });

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Ctx>(
    ({ id, describedBy, invalid, required, className, ...props }, ref) => (
        <input ref={ref} {...aria({ id, describedBy, invalid, required })} {...props} className={controlClasses(invalid, cn(props.type === 'date' || props.type === 'number' ? 'tabular-nums' : '', className))} />
    ));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & Ctx>(
    ({ id, describedBy, invalid, required, className, rows = 4, ...props }, ref) => (
        <textarea ref={ref} rows={rows} {...aria({ id, describedBy, invalid, required })} {...props} className={controlClasses(invalid, cn('py-2.5', className))} />
    ));
Textarea.displayName = 'Textarea';

/** Lista nativa (D7): hasta 10 opciones. Para más, SearchableSelect. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & Ctx & { placeholder?: string }>(
    ({ id, describedBy, invalid, required, className, placeholder, children, style, ...props }, ref) => (
        <select ref={ref} {...aria({ id, describedBy, invalid, required })} {...props} style={{ ...CHEVRON_STYLE, ...style }}
            className={controlClasses(invalid, cn('cursor-pointer appearance-none pr-10 disabled:cursor-not-allowed', className))}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {children}
        </select>
    ));
Select.displayName = 'Select';

/** Buscador de listas y tablas. */
export const SearchBox: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string; label: string; className?: string; size?: 'sm' | 'md' }> =
    ({ value, onChange, placeholder, label, className, size = 'md' }) => (
        <label className={cn('relative block min-w-0', className)}>
            <span className="sr-only">{label}</span>
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" aria-hidden="true" />
            <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className={controlClasses(false, cn('pl-10', size === 'sm' && 'min-h-9 pointer-coarse:min-h-11'))} />
        </label>
    );
