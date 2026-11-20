import React from 'react';

export type IconTileVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'neutral';

export type IconTileSize = 'sm' | 'md' | 'lg' | 'xl';

export interface IconTileProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: React.ReactNode;
  variant?: IconTileVariant;
  size?: IconTileSize;
  glow?: boolean;
}

export const IconTile: React.FC<IconTileProps> = ({
  icon,
  variant = 'primary',
  size = 'md',
  glow = false,
  className = '',
  ...props
}) => {
  const sizeClasses: Record<IconTileSize, string> = {
    sm: 'w-8 h-8 rounded-lg text-sm [&>svg]:w-4 [&>svg]:h-4',
    md: 'w-11 h-11 rounded-xl text-base [&>svg]:w-5 [&>svg]:h-5',
    lg: 'w-12 h-12 rounded-2xl text-lg [&>svg]:w-6 [&>svg]:h-6',
    xl: 'w-14 h-14 rounded-2xl text-xl [&>svg]:w-7 [&>svg]:h-7',
  };

  const variantClasses: Record<IconTileVariant, string> = {
    primary:
      'bg-primary-soft text-primary border border-primary/20',
    secondary:
      'bg-emerald-950/10 text-secondary border border-secondary/20 dark:bg-emerald-900/20',
    accent:
      'bg-accent-soft text-amber-600 dark:text-accent border border-amber-300/30',
    success:
      'bg-primary-soft text-primary border border-primary/20',
    warning:
      'bg-warning-soft text-warning border border-warning/20',
    danger:
      'bg-danger-soft text-danger border border-danger/20',
    info:
      'bg-info-soft text-info border border-info/20',
    purple:
      'bg-purple-soft text-purple border border-purple/20',
    neutral:
      'bg-surface-2 text-text-muted border border-border-subtle',
  };

  const glowClass = glow
    ? variant === 'primary'
      ? 'shadow-glow'
      : variant === 'accent'
      ? 'shadow-accent-glow'
      : 'shadow-soft'
    : 'shadow-2xs';

  return (
    <div
      className={`flex items-center justify-center shrink-0 transition-all duration-150 select-none ${sizeClasses[size]} ${variantClasses[variant]} ${glowClass} ${className}`}
      {...props}
    >
      {icon}
    </div>
  );
};
