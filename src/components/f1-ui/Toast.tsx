import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'info';
type ToastItem = { id: number; tone: ToastTone; text: string };
export type ToastApi = { success: (text: string) => void; error: (text: string) => void; info: (text: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
const ICON: Record<ToastTone, React.ReactNode> = {
    success: <CheckCircle2 size={18} className="flex-shrink-0 text-emerald-300" aria-hidden="true" />,
    error: <AlertTriangle size={18} className="flex-shrink-0 text-red-300" aria-hidden="true" />,
    info: <Info size={18} className="flex-shrink-0 text-sky-300" aria-hidden="true" />,
};

/**
 * Avisos flotantes (D10; reemplazan alert()). Abajo a la derecha (al centro en el celular), 5 segundos.
 * Los errores se quedan hasta cerrarlos y se anuncian como alerta.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [items, setItems] = useState<ToastItem[]>([]);
    const dismiss = useCallback((id: number) => setItems(list => list.filter(t => t.id !== id)), []);
    const push = useCallback((tone: ToastTone, text: string) => {
        const id = Date.now() + Math.random();
        setItems(list => [...list.slice(-3), { id, tone, text }]);
        if (tone !== 'error') window.setTimeout(() => dismiss(id), 5000);
    }, [dismiss]);
    const api = useMemo<ToastApi>(() => ({ success: t => push('success', t), error: t => push('error', t), info: t => push('info', t) }), [push]);
    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end">
                {items.map(t => (
                    <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
                        className="animate-f1-scale pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-2xl bg-tip py-2.5 pl-3.5 pr-1.5 text-sm text-tip-fg shadow-xl">
                        {ICON[t.tone]}
                        <p className="flex-1">{t.text}</p>
                        <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg opacity-80 hover:bg-white/10 hover:opacity-100"><X size={16} aria-hidden="true" /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export function useToast(): ToastApi {
    const api = useContext(ToastContext);
    if (!api) throw new Error('useToast requiere ToastProvider');
    return api;
}
