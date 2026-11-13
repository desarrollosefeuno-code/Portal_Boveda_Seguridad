import React, { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from './cn';

/**
 * Tema claro / oscuro / sistema (D18). Se guarda por navegador y se aplica con data-theme en <html>.
 * Para evitar el destello al cargar, agrega en index.html (antes del bundle) el script de THEME_BOOT_SCRIPT.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'f1-theme';

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
export const readThemePreference = (fallback: ThemePreference): ThemePreference => {
    try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' || v === 'system' ? v : fallback; } catch { return fallback; }
};
export const applyTheme = (pref: ThemePreference) => {
    const dark = pref === 'dark' || (pref === 'system' && !!media()?.matches);
    const next = dark ? 'dark' : 'light';
    const root = document.documentElement;
    if (root.dataset.theme === next) return;
    // Sin transiciones durante el cambio: los colores cambian de una vez, no en 300 ms por elemento
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{transition:none!important}';
    document.head.appendChild(freeze);
    root.dataset.theme = next;
    void root.offsetHeight;
    requestAnimationFrame(() => freeze.remove());
};

/** Script en línea para index.html. `fallback`: 'light' en portales de terreno, 'system' en los de oficina. */
export const THEME_BOOT_SCRIPT = (fallback: ThemePreference) =>
    `try{var p=localStorage.getItem('${KEY}')||'${fallback}';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;

export function useTheme(fallback: ThemePreference) {
    const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference(fallback));
    useEffect(() => {
        applyTheme(preference);
        if (preference !== 'system') return;
        const mq = media();
        const onChange = () => applyTheme('system');
        mq?.addEventListener('change', onChange);
        return () => mq?.removeEventListener('change', onChange);
    }, [preference]);
    const set = useCallback((pref: ThemePreference) => {
        setPreference(pref);
        applyTheme(pref);
        try { localStorage.setItem(KEY, pref); } catch { /* sin almacenamiento: vale solo para esta visita */ }
    }, []);
    return { preference, setPreference: set };
}

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: React.ElementType }> = [
    { id: 'light', label: 'Claro', icon: Sun }, { id: 'dark', label: 'Oscuro', icon: Moon }, { id: 'system', label: 'Sistema', icon: Monitor },
];

/** Selector para el menú de usuario. */
export const ThemePicker: React.FC<{ value: ThemePreference; onChange: (pref: ThemePreference) => void; className?: string }> = ({ value, onChange, className }) => (
    <div className={cn('grid gap-1.5', className)}>
        <span className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-3" id="f1-theme-label">Tema</span>
        <div role="radiogroup" aria-labelledby="f1-theme-label" className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-soft p-1">
            {OPTIONS.map(o => (
                <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
                    className={cn('flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-[9px] text-xs font-semibold',
                        value === o.id ? 'bg-surface text-brand shadow-sm' : 'text-fg-2 hover:text-fg')}>
                    <o.icon size={16} aria-hidden="true" />{o.label}
                </button>
            ))}
        </div>
    </div>
);
