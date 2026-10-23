import React from 'react';

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
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  const variantClasses: Record<BadgeVariant, string> = {
    success: 'bg-primary/10 text-primary border border-primary/25',
    warning: 'bg-warning/10 text-warning border border-warning/25',
    danger: 'bg-danger/10 text-danger border border-danger/25',
    info: 'bg-info/10 text-info border border-info/25',
    neutral: 'bg-elevated text-text-muted border border-border-subtle',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full select-none leading-none ${sizeClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
