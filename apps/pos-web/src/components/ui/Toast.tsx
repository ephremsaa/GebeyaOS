import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  title: string;
  message?: string;
  onClose?: () => void;
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'info',
  title,
  message,
  onClose,
  className = '',
}) => {
  const icons = {
    success: <CheckCircle2 size={20} className="text-primary flex-shrink-0" />,
    warning: <AlertTriangle size={20} className="text-warning flex-shrink-0" />,
    error: <AlertCircle size={20} className="text-danger flex-shrink-0" />,
    info: <Info size={20} className="text-info flex-shrink-0" />,
  };

  const bgClasses = {
    success: 'bg-surface border-primary/30',
    warning: 'bg-surface border-warning/30',
    error: 'bg-surface border-danger/30',
    info: 'bg-surface border-info/30',
  };

  return (
    <div
      role="alert"
      className={`flex items-start gap-3.5 p-4 rounded-2xl bg-surface border shadow-modal max-w-sm w-full transition-all animate-in slide-in-from-top duration-150 ${bgClasses[type]} ${className}`}
    >
      <div className="mt-0.5">{icons[type]}</div>
      <div className="flex-1 min-w-0">
        <h5 className="text-[15px] font-bold text-text-main leading-tight">{title}</h5>
        {message && <p className="text-[14px] text-text-muted mt-1 leading-normal">{message}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-text-dim hover:text-text-main hover:bg-surface-2 transition-colors"
          aria-label="Close notification"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
