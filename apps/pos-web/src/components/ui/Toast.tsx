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
    success: <CheckCircle2 size={18} className="text-primary flex-shrink-0" />,
    warning: <AlertTriangle size={18} className="text-warning flex-shrink-0" />,
    error: <AlertCircle size={18} className="text-danger flex-shrink-0" />,
    info: <Info size={18} className="text-info flex-shrink-0" />,
  };

  const borderClasses = {
    success: 'border-primary/30',
    warning: 'border-warning/30',
    error: 'border-danger/30',
    info: 'border-info/30',
  };

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 rounded-xl bg-surface border shadow-popover max-w-sm w-full transition-all animate-in slide-in-from-top duration-150 ${borderClasses[type]} ${className}`}
    >
      <div className="mt-0.5">{icons[type]}</div>
      <div className="flex-1 min-w-0">
        <h5 className="text-sm font-bold text-text-main leading-tight">{title}</h5>
        {message && <p className="text-xs text-text-muted mt-1 leading-normal">{message}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-text-dim hover:text-text-main hover:bg-elevated transition-colors"
          aria-label="Close notification"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
