import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const icons = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-indigo-400 shrink-0" />,
  };

  const borders = {
    success: 'border-emerald-500/40 bg-slate-900/95 text-emerald-100 shadow-emerald-950/50',
    error: 'border-rose-500/40 bg-slate-900/95 text-rose-100 shadow-rose-950/50',
    warning: 'border-amber-500/40 bg-slate-900/95 text-amber-100 shadow-amber-950/50',
    info: 'border-indigo-500/40 bg-slate-900/95 text-indigo-100 shadow-indigo-950/50',
  };

  return (
    <div
      className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-3 duration-200 text-xs font-medium ${borders[toast.type]}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {icons[toast.type]}
        <span className="truncate leading-snug">{toast.message}</span>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
