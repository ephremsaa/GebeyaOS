import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, HelpCircle } from 'lucide-react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  icon,
  children,
  className = '',
  ...props
}) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[12px] gap-1' : 'px-2.5 py-1 text-[13px] gap-1.5';

  const defaultIcons = {
    success: <CheckCircle2 size={size === 'sm' ? 12 : 14} className="flex-shrink-0" />,
    warning: <AlertTriangle size={size === 'sm' ? 12 : 14} className="flex-shrink-0" />,
    danger: <AlertCircle size={size === 'sm' ? 12 : 14} className="flex-shrink-0" />,
    info: <Info size={size === 'sm' ? 12 : 14} className="flex-shrink-0" />,
    neutral: <span className="w-1.5 h-1.5 rounded-full bg-text-muted flex-shrink-0" />,
  };

  const variantClasses: Record<BadgeVariant, string> = {
    success: 'bg-primary-soft text-primary font-semibold',
    warning: 'bg-warning-soft text-warning font-semibold',
    danger: 'bg-danger-soft text-danger font-semibold',
    info: 'bg-info-soft text-info font-semibold',
    neutral: 'bg-surface-2 text-text-muted font-medium border border-border-subtle',
  };

  const renderedIcon = icon !== undefined ? icon : defaultIcons[variant];

  return (
    <span
      className={`inline-flex items-center rounded-full select-none leading-none ${sizeClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {renderedIcon}
      <span>{children}</span>
    </span>
  );
};
