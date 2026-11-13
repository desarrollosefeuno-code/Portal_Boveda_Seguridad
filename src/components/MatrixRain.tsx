import { useEffect, useRef } from 'react';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFF1+<>/*=';

/**
 * Lluvia de caracteres de fondo. Decorativa: no recibe foco ni clics y se oculta a lectores de pantalla.
 * Se detiene con la pestaña oculta y no se dibuja si el sistema pide reducir el movimiento.
 * Toma el color del token de marca, así sigue al tema.
 */
export function MatrixRain({ enabled, intensity = 'low' }: { enabled: boolean; intensity?: 'low' | 'high' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!canvas || !enabled || reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const color = styles.getPropertyValue('--f1-brand').trim() || '#39ff6a';
    const page = styles.getPropertyValue('--f1-page').trim() || '#000300';
    const head = styles.getPropertyValue('--f1-fg').trim() || color;
    const fontSize = 16;
    let columns: number[] = [];
    let frame = 0;
    let last = 0;
    const interval = intensity === 'high' ? 45 : 70;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * ratio;
      canvas.height = window.innerHeight * ratio;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      columns = Array.from({ length: Math.ceil(window.innerWidth / fontSize) }, () => Math.random() * -50);
      ctx.fillStyle = page;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      if (time - last < interval) return;
      last = time;
      ctx.fillStyle = `${page}29`; // estela: cubre con el fondo semitransparente
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.font = `${fontSize}px 'JetBrains Mono Variable', monospace`;
      for (let i = 0; i < columns.length; i++) {
        const y = columns[i] * fontSize;
        const glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        ctx.fillStyle = Math.random() > 0.975 ? head : color;
        ctx.fillText(glyph, i * fontSize, y);
        columns[i] = y > window.innerHeight && Math.random() > 0.975 ? 0 : columns[i] + 1;
      }
    };

    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intensity]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 z-0 ${intensity === 'high' ? 'opacity-60' : 'opacity-25'}`}
    />
  );
}

const RAIN_KEY = 'f1v-matrix-rain';

export function readRainPreference(): boolean {
  try {
    return localStorage.getItem(RAIN_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveRainPreference(on: boolean): void {
  try {
    localStorage.setItem(RAIN_KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
}
