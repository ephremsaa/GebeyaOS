import React from 'react';
import { ShoppingBag } from 'lucide-react';
import {
  EmptyCartIllustration,
  EmptyProductsIllustration,
  EmptyOrdersIllustration,
  EmptySearchIllustration,
  EmptySyncIllustration,
} from './EmptyStateIllustrations';

export type EmptyStateIllustrationType = 'cart' | 'products' | 'orders' | 'search' | 'sync';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  illustration?: EmptyStateIllustrationType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  illustration,
  title,
  subtitle,
  action,
  className = '',
}) => {
  const renderVisual = () => {
    if (illustration) {
      switch (illustration) {
        case 'cart':
          return <EmptyCartIllustration size={100} className="mb-4" />;
        case 'products':
          return <EmptyProductsIllustration size={100} className="mb-4" />;
        case 'orders':
          return <EmptyOrdersIllustration size={100} className="mb-4" />;
        case 'search':
          return <EmptySearchIllustration size={100} className="mb-4" />;
        case 'sync':
          return <EmptySyncIllustration size={100} className="mb-4" />;
      }
    }

    if (icon) {
      return (
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-center mb-4 text-text-muted shadow-2xs">
          {icon}
        </div>
      );
    }

    return (
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-center mb-4 text-text-muted shadow-2xs">
        <ShoppingBag size={32} className="text-text-muted" />
      </div>
    );
  };

  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center h-full select-none ${className}`}>
      {renderVisual()}
      <h3 className="text-base font-bold text-text-main tracking-tight">{title}</h3>
      {subtitle && (
        <p className="text-xs text-text-muted mt-1 max-w-[280px] leading-relaxed">
          {subtitle}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};
