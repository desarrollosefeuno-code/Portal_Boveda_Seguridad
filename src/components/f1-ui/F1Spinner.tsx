// Spinner corporativo F1+ (D12): al abrir el portal o en cargas de una pantalla o un bloque. Colores de marca y de apoyo.
// Regla: NUNCA dentro de un botón (el logo no se distingue y agranda el botón). En botones: Button con `loading` o ButtonSpinner.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Carga dentro de un botón propio: ícono de 16 px que gira, igual al de Button `loading`. */
export function ButtonSpinner({ className = '' }: { className?: string }) {
  return <Loader2 size={16} aria-hidden="true" className={`flex-shrink-0 animate-spin motion-reduce:animate-none ${className}`} />;
}

export interface F1SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  subtext?: string;
  showProgress?: boolean;
  className?: string;
}

export function F1Spinner({
  size = 'md',
  text,
  subtext,
  showProgress = false,
  className = '',
}: F1SpinnerProps) {
  const [logoError, setLogoError] = useState(false);

  // Dimensiones según el tamaño
  const sizeConfig = {
    sm: {
      container: 'w-8 h-8',
      svg: 32,
      strokeWidthOuter: 3,
      strokeWidthInner: 2,
      logoSize: 'w-4 h-4 text-[9px]',
      fontSize: 'text-xs',
      subFontSize: 'text-[10px]',
    },
    md: {
      container: 'w-14 h-14',
      svg: 56,
      strokeWidthOuter: 3.5,
      strokeWidthInner: 2,
      logoSize: 'w-7 h-7 text-xs',
      fontSize: 'text-xs sm:text-sm',
      subFontSize: 'text-[11px]',
    },
    lg: {
      container: 'w-24 h-24',
      svg: 96,
      strokeWidthOuter: 4,
      strokeWidthInner: 2.5,
      logoSize: 'w-12 h-12 text-base',
      fontSize: 'text-sm sm:text-base',
      subFontSize: 'text-xs',
    },
    xl: {
      container: 'w-32 h-32',
      svg: 128,
      strokeWidthOuter: 4.5,
      strokeWidthInner: 3,
      logoSize: 'w-16 h-16 text-xl',
      fontSize: 'text-base sm:text-lg',
      subFontSize: 'text-xs sm:text-sm',
    },
  }[size];

  const dim = sizeConfig.svg;
  const center = dim / 2;
  const radiusOuter = center - 4;
  const radiusInner = center - (size === 'sm' ? 8 : size === 'md' ? 12 : 18);

  const circumferenceOuter = 2 * Math.PI * radiusOuter;
  const circumferenceInner = 2 * Math.PI * radiusInner;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Contenedor del Spinner con Isotipo Central */}
      <div className={`relative ${sizeConfig.container} flex items-center justify-center`}>
        {/* Resplandor de fondo (Aura F1) */}
        <div
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#ff5f00]/25 via-[#69aae1]/15 to-[#ff5f00]/10 blur-md animate-f1-pulse-glow pointer-events-none"
          aria-hidden="true"
        />

        {/* Órbitas SVG de Telecomunicaciones */}
        <svg
          width={dim}
          height={dim}
          viewBox={`0 0 ${dim} ${dim}`}
          className="absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <defs>
            {/* Gradiente Naranja Corporativo F1 */}
            <linearGradient id={`f1OrangeGrad-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff5f00" stopOpacity="1" />
              <stop offset="65%" stopColor="#ffa040" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ff5f00" stopOpacity="0.1" />
            </linearGradient>

            {/* Gradiente Azul Telecom */}
            <linearGradient id={`f1BlueGrad-${size}`} x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#69aae1" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#9ccbf0" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#69aae1" stopOpacity="0.1" />
            </linearGradient>

            {/* Sombra suave para el punto satelital */}
            <filter id={`f1Glow-${size}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ff5f00" floodOpacity="0.6" />
            </filter>
          </defs>

          {/* Guía circular estática muy sutil */}
          <circle
            cx={center}
            cy={center}
            r={radiusOuter}
            fill="none"
            stroke="currentColor"
            className="text-line"
            strokeWidth={sizeConfig.strokeWidthOuter}
          />

          {/* Anillo Exterior Giratorio Principal (Naranja F1 - Sentido Horario) */}
          <circle
            cx={center}
            cy={center}
            r={radiusOuter}
            fill="none"
            stroke={`url(#f1OrangeGrad-${size})`}
            strokeWidth={sizeConfig.strokeWidthOuter}
            strokeLinecap="round"
            strokeDasharray={`${circumferenceOuter * 0.72} ${circumferenceOuter * 0.28}`}
            className="origin-center animate-spin-slow"
          />

          {/* Anillo Interior Giratorio (Azul Telecom - Sentido Antihorario) */}
          {size !== 'sm' && (
            <circle
              cx={center}
              cy={center}
              r={radiusInner}
              fill="none"
              stroke={`url(#f1BlueGrad-${size})`}
              strokeWidth={sizeConfig.strokeWidthInner}
              strokeLinecap="round"
              strokeDasharray={`${circumferenceInner * 0.45} ${circumferenceInner * 0.55}`}
              className="origin-center animate-spin-reverse"
            />
          )}

          {/* Punto de enlace satelital en órbita */}
          {size !== 'sm' && (
            <g className="origin-center animate-spin-slow">
              <circle
                cx={center + radiusOuter}
                cy={center}
                r={size === 'xl' ? 3 : 2}
                fill="#ffffff"
                filter={`url(#f1Glow-${size})`}
              />
            </g>
          )}
        </svg>

        {/* Núcleo Central: Logotipo / Emblema F1 con respiración */}
        <div className="relative z-10 flex items-center justify-center animate-f1-breathe">
          {size === 'sm' ? (
            <span className="font-black text-[#ff5f00] tracking-tighter leading-none select-none text-[11px]">
              F1<span className="text-[#69aae1]">+</span>
            </span>
          ) : !logoError ? (
            <img
              src="/logo.webp"
              alt="F1+"
              className={`${sizeConfig.logoSize} object-contain select-none drop-shadow-sm`}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className={`${sizeConfig.logoSize} rounded-full bg-gradient-to-tr from-[#ff5f00] to-primary-400 text-white font-black flex items-center justify-center shadow-md tracking-tighter select-none`}>
              F1+
            </div>
          )}
        </div>
      </div>

      {/* Texto Descriptivo con Micro-animación */}
      {(text || subtext) && (
        <div className="mt-4 text-center space-y-1">
          {text && (
            <p className={`font-bold text-fg font-display ${sizeConfig.fontSize} tracking-tight`}>
              {text}
            </p>
          )}
          {subtext && (
            <p className={`text-fg-3 ${sizeConfig.subFontSize}`}>
              {subtext}
            </p>
          )}

          {/* Barra de progreso corporativa indeterminada */}
          {showProgress && (
            <div className="w-36 sm:w-44 h-1 bg-line rounded-full overflow-hidden mx-auto mt-2.5">
              <div className="h-full w-1/2 bg-gradient-to-r from-[#ff5f00] to-[#69aae1] rounded-full animate-f1-progress" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default F1Spinner;

/**
 * Pantalla completa de carga institucional F1+ (misma que Hub Central y Rendiciones)
 */
export function F1LoadingScreen({
  text = 'Cargando Gestión Terreno F1+…',
  subtext = 'Conectando con el entorno corporativo seguro',
}: {
  text?: string;
  subtext?: string;
}) {
  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6 animate-f1-fade" role="status" aria-live="polite">
      <F1Spinner size="xl" text={text} subtext={subtext} showProgress={true} />
    </div>
  );
}
