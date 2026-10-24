import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  position?: 'right' | 'left';
  width?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  position = 'right',
  width = 'md',
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

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  }[width];

  const positionClasses = position === 'right' ? 'right-0' : 'left-0';

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className={`fixed top-0 bottom-0 ${positionClasses} w-full ${widthClasses} bg-surface border-l border-border-subtle shadow-modal flex flex-col transition-transform duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 px-6 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface">
          <div>
            <h3 className="text-base font-semibold text-text-main">{title}</h3>
            {subtitle && <p className="text-[13px] text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors duration-fast cursor-pointer"
            aria-label="Close drawer"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
};
