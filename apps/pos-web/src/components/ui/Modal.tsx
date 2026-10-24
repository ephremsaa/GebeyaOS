import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = 'lg',
  children,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-4xl',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClasses} bg-surface rounded-2xl shadow-modal border border-border-subtle overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] transition-transform duration-200 scale-100`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface">
          <div>
            <h2 className="text-lg font-semibold text-text-main leading-snug">{title}</h2>
            {subtitle && (
              <p className="text-[13px] text-text-muted mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors duration-fast cursor-pointer"
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
