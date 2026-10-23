import React from 'react';

export interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  subtitle,
  actions,
  children,
  fullWidth = false,
  className = '',
}) => {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-page text-text-main">
      {/* Optional Page Header */}
      {(title || actions) && (
        <header className="px-6 py-4 border-b border-border-subtle bg-surface/70 backdrop-blur-xs flex items-center justify-between flex-shrink-0">
          <div>
            {title && <h1 className="text-xl font-bold tracking-tight text-text-main">{title}</h1>}
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2.5">{actions}</div>}
        </header>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 overflow-y-auto ${
          fullWidth ? 'w-full p-4 sm:p-6' : 'w-full max-w-[1280px] mx-auto p-4 sm:p-6 lg:p-8'
        } ${className}`}
      >
        {children}
      </div>
    </div>
  );
};
