import React, { useId } from 'react';
import { cn } from './cn';

export interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Nombre accesible si no se usa SwitchRow. */
    label?: string;
    labelledBy?: string;
    disabled?: boolean;
    className?: string;
}

/** Interruptor (D17): solo para algo que surte efecto al tocarlo. Dentro de un formulario con Guardar, usa Checkbox. */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, labelledBy, disabled, className }) => (
    <button type="button" role="switch" aria-checked={checked} aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-45',
            checked ? 'bg-action' : 'bg-line-strong', className)}>
        <span aria-hidden="true" className={cn('absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform motion-reduce:transition-none',
            checked && 'translate-x-5')} />
    </button>
);

/** Fila con título, explicación, estado en palabras e interruptor (D17). */
export const SwitchRow: React.FC<Omit<SwitchProps, 'label' | 'labelledBy'> & { title: React.ReactNode; description?: React.ReactNode; onText?: string; offText?: string }> =
    ({ title, description, onText = 'Activo', offText = 'Inactivo', checked, onChange, disabled, className }) => {
        const id = useId();
        return (
            <div className={cn('flex min-h-14 items-center justify-between gap-4 rounded-xl border border-line bg-surface px-3 py-2', className)}>
                <div className="min-w-0">
                    <p id={id} className="font-semibold text-fg">{title}</p>
                    {description && <p className="text-[13px] text-fg-3">{description}</p>}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2.5">
                    <span className="min-w-14 text-right text-[13px] font-semibold text-fg-2" aria-hidden="true">{checked ? onText : offText}</span>
                    <Switch checked={checked} onChange={onChange} labelledBy={id} disabled={disabled} />
                </div>
            </div>
        );
    };
