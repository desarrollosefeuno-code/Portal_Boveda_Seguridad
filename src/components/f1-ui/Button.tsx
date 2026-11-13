import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANT: Record<ButtonVariant, string> = {
    primary: 'bg-action text-white shadow-sm hover:bg-action-hover',
    secondary: 'border border-line-strong bg-surface text-fg-2 hover:bg-hover hover:text-fg',
    ghost: 'text-brand hover:bg-brand-soft',
    danger: 'bg-danger text-white hover:bg-danger-hover',
};
const SIZE: Record<ButtonSize, string> = {
    sm: 'min-h-9 px-3 text-sm pointer-coarse:min-h-11',
    md: 'min-h-11 px-4 text-sm',
};

export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) =>
    cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant], SIZE[size], className);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Muestra el ícono girando, deshabilita el botón y cambia el texto (D4). */
    loading?: boolean;
    loadingText?: string;
    icon?: React.ElementType;
}

/** Botón del estándar F1+ (D4): una acción primaria por vista; peligro solo para confirmar algo destructivo. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = 'primary', size = 'md', loading = false, loadingText, icon: Icon, className, children, disabled, type = 'button', ...props }, ref) => (
        <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses(variant, size, className)} {...props}>
            {loading ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : Icon && <Icon size={16} aria-hidden="true" />}
            {loading && loadingText ? loadingText : children}
        </button>
    ));
Button.displayName = 'Button';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
    /** Nombre accesible obligatorio, idealmente con el registro: "Editar solicitud 1042". */
    label: string;
    /** Texto corto que aparece al pasar el mouse o con el teclado; por defecto, el label. */
    tip?: string;
    icon: React.ElementType;
    tone?: 'neutral' | 'danger';
    tipSide?: 'top' | 'bottom';
}

/** Botón de solo ícono (D5): neutro, toma color al pasar el mouse; 36 px y 44 px en pantallas táctiles. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    ({ label, tip, icon: Icon, tone = 'neutral', tipSide = 'top', className, type = 'button', ...props }, ref) => (
        <button ref={ref} type={type} aria-label={label} className={cn(
            'group relative inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] text-fg-3 transition-colors pointer-coarse:h-11 pointer-coarse:w-11 disabled:cursor-not-allowed disabled:opacity-40',
            tone === 'danger' ? 'hover:bg-bad-soft hover:text-bad' : 'hover:bg-brand-soft hover:text-brand', className)} {...props}>
            <Icon size={16} aria-hidden="true" />
            <span aria-hidden="true" className={cn('pointer-events-none absolute right-0 z-20 hidden whitespace-nowrap rounded-md bg-tip px-2 py-1 text-xs font-medium text-tip-fg group-hover:block group-focus-visible:block pointer-coarse:!hidden',
                tipSide === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5')}>{tip ?? label}</span>
        </button>
    ));
IconButton.displayName = 'IconButton';
