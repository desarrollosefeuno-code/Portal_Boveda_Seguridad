import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Lightbulb, SearchX, ShieldAlert, type LucideIcon,
} from 'lucide-react';
import { cn } from './cn';
import { TONE, type Tone } from './Alert';
import { SearchBox, Select } from './Field';
import { Tabs } from './Tabs';

/**
 * Guía / ayuda de un portal (D19). Un tema a la vez, con índice por grupos (fijo en computador, lista desplegable en
 * teléfono y tablet), buscador sin tildes y botones Anterior / Siguiente. Cada portal aporta sus temas; el filtrado
 * por rol lo hace el portal antes de pasar `topics` (los usuarios comunes ven solo lo suyo). Con `views`, quien
 * administra puede ver la guía «como» otro rol para capacitar.
 *
 * Es documentación: lo que cada rol puede hacer lo decide el servidor, no esta pantalla.
 */

export interface GuideGroup { id: string; label: string }
export interface GuideRoleTag { label: string; tone: Tone }
export interface GuideTopic {
    id: string;
    group: string;
    title: string;
    summary: string;
    icon: LucideIcon;
    /** Quién realiza lo que explica el tema (se muestra con `showWho`). */
    who?: GuideRoleTag[];
    /** Palabras extra para el buscador. */
    keywords?: string;
    body: (go: (id: string) => void) => React.ReactNode;
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const read = (key: string) => { try { return sessionStorage.getItem(key); } catch { return null; } };
const write = (key: string, id: string) => { try { sessionStorage.setItem(key, id); } catch { /* sin almacenamiento */ } };

export interface GuideShellProps<V extends string> {
    title?: string;
    /** Bajo el título: para quién es el contenido. */
    intro: React.ReactNode;
    /** Línea pequeña (por ejemplo, «Tu rol: Administrador»). Se le suma la cantidad de temas. */
    meta?: React.ReactNode;
    groups: GuideGroup[];
    /** Temas visibles para la vista actual, en orden de lectura. */
    topics: GuideTopic[];
    /** Selector «Ver la guía como» (solo para quien puede ver todos los flujos). */
    views?: { value: V; options: { id: V; label: string }[]; onChange: (v: V) => void; label?: string };
    /** Mostrar las insignias de «Quién lo hace». */
    showWho?: boolean;
    /** Clave de sessionStorage para recordar el tema abierto. */
    storageKey: string;
    startId?: string;
    searchPlaceholder?: string;
}

export function GuideShell<V extends string>({
    title = 'Guía Rápida', intro, meta, groups, topics, views, showWho, storageKey, startId, searchPlaceholder = 'Buscar en la guía…',
}: GuideShellProps<V>) {
    const [topicId, setTopicId] = useState<string>(() => read(storageKey) ?? startId ?? topics[0]?.id ?? '');
    const [query, setQuery] = useState('');
    const headingRef = useRef<HTMLHeadingElement>(null);
    const articleRef = useRef<HTMLElement>(null);
    const navigated = useRef(false);

    const index = topics.findIndex(t => t.id === topicId);
    const position = index >= 0 ? index : 0;
    const topic = topics[position];

    const go = useCallback((id: string) => {
        navigated.current = true;
        setTopicId(id);
        setQuery('');
        write(storageKey, id);
    }, [storageKey]);

    // Al cambiar de tema: arriba del artículo y foco en su título (teclado y lector de pantalla)
    useEffect(() => {
        if (!navigated.current) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        articleRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
        headingRef.current?.focus({ preventScroll: true });
    }, [topic?.id]);

    const results = useMemo(() => {
        const q = normalize(query.trim());
        if (!q) return null;
        const words = q.split(/\s+/);
        return topics.filter(t => {
            const hay = normalize(`${t.title} ${t.summary} ${t.keywords ?? ''} ${groups.find(g => g.id === t.group)?.label ?? ''}`);
            return words.every(w => hay.includes(w));
        });
    }, [query, topics, groups]);

    if (!topic) return null;
    const grouped = groups.map(g => ({ ...g, topics: topics.filter(t => t.group === g.id) })).filter(g => g.topics.length > 0);
    const prev = topics[position - 1];
    const next = topics[position + 1];
    const groupLabel = groups.find(g => g.id === topic.group)?.label;
    const Icon = topic.icon;

    const topicButton = (t: GuideTopic, showGroup?: boolean) => {
        const TIcon = t.icon;
        const current = t.id === topic.id;
        return (
            <button type="button" onClick={() => go(t.id)} aria-current={current ? 'page' : undefined}
                className={cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    current ? 'bg-brand-soft font-semibold text-brand' : 'text-fg-2 hover:bg-surface-2 hover:text-fg')}>
                <TIcon size={16} className={cn('mt-0.5 flex-shrink-0', current ? 'text-brand' : 'text-fg-3')} aria-hidden="true" />
                <span className="min-w-0">
                    <span className="block">{t.title}</span>
                    {showGroup && <span className="block text-xs font-normal text-fg-3">{groups.find(g => g.id === t.group)?.label} · {t.summary}</span>}
                </span>
            </button>
        );
    };

    const navCard = (t: GuideTopic, dir: 'prev' | 'next') => (
        <button type="button" onClick={() => go(t.id)}
            className={cn('group flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 py-2 transition-colors hover:border-brand-line hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                dir === 'prev' ? 'text-left' : 'justify-end text-right')}>
            {dir === 'prev' && <ChevronLeft size={20} className="flex-shrink-0 text-fg-3 group-hover:text-brand" aria-hidden="true" />}
            <span className="min-w-0"><span className="block text-xs text-fg-3">{dir === 'prev' ? 'Anterior' : 'Siguiente'}</span><span className="block truncate text-sm font-semibold text-fg">{t.title}</span></span>
            {dir === 'next' && <ChevronRight size={20} className="flex-shrink-0 text-fg-3 group-hover:text-brand" aria-hidden="true" />}
        </button>
    );

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
            <header className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-start gap-4">
                        <span aria-hidden="true" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand"><BookOpen size={24} /></span>
                        <div className="min-w-0">
                            <h2 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h2>
                            <p className="mt-1 max-w-2xl text-sm leading-6 text-fg-2">{intro}</p>
                            <p className="mt-2 text-xs text-fg-3">{meta}{meta ? ' · ' : ''}{topics.length} temas</p>
                        </div>
                    </div>
                    {views && views.options.length > 1 && (
                        <div className="min-w-0">
                            <p aria-hidden="true" className="mb-1.5 text-xs font-semibold text-fg-2">{views.label ?? 'Ver la guía como'}</p>
                            <Tabs id="guia-vista" label={views.label ?? 'Ver la guía como'} value={views.value}
                                onChange={v => { navigated.current = false; views.onChange(v); }} items={views.options} />
                        </div>
                    )}
                </div>
            </header>

            <div className="grid gap-5 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
                <nav aria-label="Temas de la guía" className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-7.5rem)] lg:self-start lg:overflow-y-auto">
                    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 shadow-sm">
                        <SearchBox value={query} onChange={setQuery} label="Buscar en la guía" placeholder={searchPlaceholder} />
                        {results ? (
                            <div aria-live="polite">
                                <p className="px-1 pb-1 text-xs font-semibold text-fg-3">{results.length === 0 ? 'Sin resultados' : `${results.length} ${results.length === 1 ? 'tema' : 'temas'}`}</p>
                                {results.length === 0
                                    ? <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm text-fg-2"><SearchX size={16} className="mt-0.5 flex-shrink-0 text-fg-3" aria-hidden="true" />Prueba con otra palabra.</p>
                                    : <ul className="space-y-0.5">{results.map(t => <li key={t.id}>{topicButton(t, true)}</li>)}</ul>}
                            </div>
                        ) : (
                            <>
                                {/* Teléfono y tablet: lista desplegable para no empujar el contenido */}
                                <div className="lg:hidden">
                                    <label htmlFor="guia-tema" className="mb-1.5 block text-xs font-semibold text-fg-2">Tema ({position + 1} de {topics.length})</label>
                                    <Select id="guia-tema" value={topic.id} onChange={e => go(e.target.value)}>
                                        {grouped.map(g => <optgroup key={g.id} label={g.label}>{g.topics.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>)}
                                    </Select>
                                </div>
                                <div className="hidden space-y-3 lg:block">
                                    {grouped.map(g => (
                                        <section key={g.id} aria-labelledby={`guia-g-${g.id}`}>
                                            <h3 id={`guia-g-${g.id}`} className="px-2.5 pb-1 text-xs font-bold uppercase tracking-wider text-fg-3">{g.label}</h3>
                                            <ul className="space-y-0.5">{g.topics.map(t => <li key={t.id}>{topicButton(t)}</li>)}</ul>
                                        </section>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </nav>

                <article ref={articleRef} aria-labelledby="guia-titulo" className="min-w-0 scroll-mt-4 rounded-2xl border border-line bg-surface shadow-sm">
                    <header className="border-b border-line-soft bg-surface-2 px-5 py-5 sm:px-7">
                        <p className="text-xs font-bold uppercase tracking-wider text-brand">{groupLabel} · Tema {position + 1} de {topics.length}</p>
                        <div className="mt-2 flex items-start gap-3">
                            <span aria-hidden="true" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-action text-white shadow-sm"><Icon size={22} /></span>
                            <div className="min-w-0">
                                <h2 id="guia-titulo" ref={headingRef} tabIndex={-1} className="text-xl font-bold tracking-tight text-fg focus:outline-none sm:text-2xl">{topic.title}</h2>
                                <p className="mt-1 text-sm leading-6 text-fg-2 sm:text-base">{topic.summary}</p>
                            </div>
                        </div>
                        {showWho && topic.who && topic.who.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-fg-3">Quién lo hace:</span><RoleTags tags={topic.who} /></div>
                        )}
                    </header>
                    <div className="space-y-5 p-5 sm:p-7">{topic.body(go)}</div>
                    <footer className="grid gap-3 border-t border-line-soft p-4 sm:grid-cols-2 sm:p-5">
                        {prev ? navCard(prev, 'prev') : <span className="hidden sm:block" />}
                        {next && navCard(next, 'next')}
                    </footer>
                </article>
            </div>
        </div>
    );
}

// ───────────────────────── Piezas del contenido ─────────────────────────

export type StepItem = React.ReactNode | false | null | undefined;
const visible = (items: StepItem[]) => items.filter((x): x is React.ReactNode => x !== false && x !== null && x !== undefined && x !== '');
const grid2 = 'grid gap-4 lg:grid-cols-2';

/** Dos columnas en pantallas anchas. */
export const GuideCols: React.FC<{ children: React.ReactNode; cols?: 2 | 3 }> = ({ children, cols = 2 }) =>
    <div className={cols === 3 ? 'grid gap-4 md:grid-cols-3' : grid2}>{children}</div>;

/** Insignias de rol («Quién lo hace»). */
export const RoleTags: React.FC<{ tags: GuideRoleTag[]; className?: string }> = ({ tags, className }) => (
    <ul aria-label="Quién lo hace" className={cn('flex flex-wrap gap-1.5', className)}>
        {tags.map(t => <li key={t.label} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', TONE[t.tone])}>{t.label}</li>)}
    </ul>
);

/** Ruta de pantallas para llegar a la función: «Solicitudes › Nueva solicitud». */
export const Where: React.FC<{ path: string[] }> = ({ path }) => (
    <p className="flex flex-wrap items-center gap-1 text-sm text-fg-2">
        <span className="font-semibold text-fg">Dónde:</span>
        {path.map((p, i) => (
            <React.Fragment key={p + i}>
                {i > 0 && <ChevronRight size={14} className="text-fg-3" aria-hidden="true" />}
                <span className="rounded-md bg-surface-2 px-2 py-0.5 font-medium text-fg">{p}</span>
            </React.Fragment>
        ))}
    </p>
);

/** Proceso de varias etapas: tarjetas numeradas con flecha (horizontal en pantallas anchas, vertical en el teléfono). */
export const Flow: React.FC<{ title: string; steps: { title: string; detail: string }[] }> = ({ title, steps }) => (
    <figure className="rounded-xl border border-brand-line bg-brand-soft p-4">
        <figcaption className="mb-3 text-sm font-bold text-brand">{title}</figcaption>
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
            {steps.map((s, i) => (
                <li key={s.title} className="flex flex-col items-center gap-2 md:flex-1 md:flex-row">
                    <div className="flex w-full flex-1 items-start gap-3 self-stretch rounded-lg border border-line bg-surface p-3 shadow-sm md:flex-col md:gap-2">
                        <span aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-action text-xs font-bold text-white">{i + 1}</span>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-fg"><span className="sr-only">Paso {i + 1}: </span>{s.title}</p>
                            <p className="mt-0.5 text-xs leading-5 text-fg-2">{s.detail}</p>
                        </div>
                    </div>
                    {i < steps.length - 1 && <><ChevronDown size={18} className="text-brand md:hidden" aria-hidden="true" /><ChevronRight size={18} className="hidden flex-shrink-0 text-brand md:block" aria-hidden="true" /></>}
                </li>
            ))}
        </ol>
    </figure>
);

/** Pasos numerados. Acepta `false`/`null` para ocultar un paso según el rol. */
export const Steps: React.FC<{ title?: string; items: StepItem[] }> = ({ title, items }) => (
    <div>
        {title && <h3 className="mb-3 text-base font-bold text-fg">{title}</h3>}
        <ol className="space-y-3">
            {visible(items).map((x, i) => (
                <li key={i} className="flex gap-3 text-sm leading-6 text-fg-2">
                    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                    <span className="min-w-0">{x}</span>
                </li>
            ))}
        </ol>
    </div>
);

/** Lista sin orden (datos, reglas). */
export const Bullets: React.FC<{ title?: string; items: StepItem[] }> = ({ title, items }) => (
    <div>
        {title && <h3 className="mb-2 text-base font-bold text-fg">{title}</h3>}
        <ul className="space-y-2">
            {visible(items).map((x, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-6 text-fg-2">
                    <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand" />
                    <span className="min-w-0">{x}</span>
                </li>
            ))}
        </ul>
    </div>
);

const TIP = {
    tip: { icon: Lightbulb, label: 'Consejo', cls: 'border-info-line bg-info-soft', text: 'text-info' },
    warn: { icon: AlertTriangle, label: 'Atención', cls: 'border-warn-line bg-warn-soft', text: 'text-warn' },
    rule: { icon: ShieldAlert, label: 'Regla', cls: 'border-bad-line bg-bad-soft', text: 'text-bad' },
} as const;

/** Recuadro de consejo, advertencia o regla de negocio. */
export const Tip: React.FC<{ kind?: keyof typeof TIP; title?: string; children: React.ReactNode }> = ({ kind = 'tip', title, children }) => {
    const t = TIP[kind];
    const Icon = t.icon;
    return (
        <aside className={cn('flex gap-3 rounded-xl border p-4', t.cls)}>
            <Icon size={20} className={cn('mt-0.5 flex-shrink-0', t.text)} aria-hidden="true" />
            <div className="min-w-0 text-sm leading-6 text-fg-2">
                <p className={cn('font-bold', t.text)}>{title ?? t.label}</p>
                <div>{children}</div>
            </div>
        </aside>
    );
};

/** Tarjeta de contenido. */
export const Box: React.FC<{ title?: string; children: React.ReactNode; className?: string }> = ({ title, children, className }) => (
    <section className={cn('rounded-xl border border-line bg-surface p-4 sm:p-5', className)}>
        {title && <h3 className="mb-3 text-base font-bold text-fg">{title}</h3>}
        <div className="text-sm leading-6 text-fg-2">{children}</div>
    </section>
);

/** Preguntas frecuentes desplegables (details/summary). */
export const Faq: React.FC<{ items: { q: string; a: React.ReactNode }[] }> = ({ items }) => (
    <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
        {items.map(({ q, a }) => (
            <details key={q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 [&::-webkit-details-marker]:hidden">
                    {q}
                    <ChevronDown size={18} className="flex-shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="px-4 pb-4 text-sm leading-6 text-fg-2">{a}</div>
            </details>
        ))}
    </div>
);

/** Glosario: envuelve varios `Term`. */
export const Glossary: React.FC<{ children: React.ReactNode }> = ({ children }) => <dl className="grid gap-3 sm:grid-cols-2">{children}</dl>;
export const Term: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => (
    <div className="rounded-lg border border-line-soft bg-surface-2 p-3">
        <dt className="text-sm font-bold text-fg">{name}</dt>
        <dd className="mt-1 text-sm leading-6 text-fg-2">{children}</dd>
    </div>
);

/** Nombre de botón o pantalla tal como aparece en el portal. */
export const Ui: React.FC<{ children: React.ReactNode }> = ({ children }) => <strong className="font-semibold text-fg">«{children}»</strong>;

/** Enlace a otro tema de la guía. */
export const See: React.FC<{ go: (id: string) => void; id: string; children: React.ReactNode }> = ({ go, id, children }) => (
    <button type="button" onClick={() => go(id)} className="font-semibold text-brand underline decoration-brand-line underline-offset-2 hover:decoration-brand focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
        {children}
    </button>
);

/** Ruta de aprendizaje: temas en orden, con botón para ir a cada uno. */
export const LearningPath: React.FC<{ go: (id: string) => void; title: string; who: string; items: { id: string; text: string }[] }> = ({ go, title, who, items }) => (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-brand">{who}</p>
        <h3 className="mt-1 text-base font-bold text-fg">{title}</h3>
        <ol className="mt-3 space-y-2">
            {items.map((it, i) => (
                <li key={it.id}>
                    <button type="button" onClick={() => go(it.id)}
                        className="group flex w-full items-center gap-3 rounded-lg border border-line-soft bg-surface-2 px-3 py-2.5 text-left text-sm transition-colors hover:border-brand-line hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
                        <span aria-hidden="true" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-action text-xs font-bold text-white">{i + 1}</span>
                        <span className="min-w-0 flex-1 font-medium text-fg">{it.text}</span>
                        <ArrowRight size={16} className="flex-shrink-0 text-fg-3 group-hover:text-brand" aria-hidden="true" />
                    </button>
                </li>
            ))}
        </ol>
    </section>
);
