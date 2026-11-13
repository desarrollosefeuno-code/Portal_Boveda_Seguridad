import React from 'react';
import { TONE, type Tone } from './Alert';
import { cn } from './cn';

/**
 * Estado como píldora (D11). Gris: no empieza. Ámbar: espera a alguien. Azul (apoyo): en curso.
 * Verde: terminado bien. Rojo: bloqueado o rechazado. Naranja: solo "Nuevo" o destacados.
 * Cada portal mapea sus estados a un tono en un solo archivo.
 */
export const Badge: React.FC<{ tone?: Tone; icon?: React.ElementType; children: React.ReactNode; className?: string }> = ({ tone = 'neutral', icon: Icon, children, className }) => (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE[tone], className)}>
        {Icon ? <Icon size={13} aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
        {children}
    </span>
);
