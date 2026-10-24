import React from 'react';

export interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  subtitle,
  badge,
  primaryAction,
  secondaryActions,
  children,
  fullWidth = false,
  className = '',
}) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-page text-text-main">
      {/* Page Header (with One primary action aligned right) */}
      {(title || primaryAction || secondaryActions) && (
        <header className="px-6 py-4 border-b border-border-subtle bg-surface flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                {title && <h1 className="page-title">{title}</h1>}
                {badge && <div className="flex-shrink-0">{badge}</div>}
              </div>
              {subtitle && <p className="text-[13px] text-text-muted mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {secondaryActions && <div className="flex items-center gap-2">{secondaryActions}</div>}
            {primaryAction && <div className="flex items-center">{primaryAction}</div>}
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 overflow-y-auto ${
          fullWidth ? 'w-full p-6' : 'w-full max-w-[1280px] mx-auto p-6'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
};
