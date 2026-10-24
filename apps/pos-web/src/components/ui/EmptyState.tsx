import React from 'react';
import { ShoppingBag } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <ShoppingBag size={36} className="text-text-muted" />,
  title,
  subtitle,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center h-full select-none ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-center mb-3 text-text-muted">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-text-main">{title}</h3>
      {subtitle && (
        <p className="text-[13px] text-text-muted mt-1 max-w-[260px] leading-relaxed">
          {subtitle}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
