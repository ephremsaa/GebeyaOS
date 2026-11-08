import React from 'react';

export type IconTileVariant =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
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
    md: 'w-10 h-10 rounded-xl text-base [&>svg]:w-5 [&>svg]:h-5',
    lg: 'w-12 h-12 rounded-2xl text-lg [&>svg]:w-6 [&>svg]:h-6',
    xl: 'w-14 h-14 rounded-2xl text-xl [&>svg]:w-7 [&>svg]:h-7',
  };

  const variantClasses: Record<IconTileVariant, string> = {
    primary:
      'bg-primary/10 text-primary border border-primary/20 dark:bg-primary/15 dark:border-primary/30',
    secondary:
      'bg-secondary/15 text-secondary border border-secondary/25 dark:bg-secondary/20 dark:border-secondary/35',
    accent:
      'bg-accent/15 text-amber-500 dark:text-accent border border-accent/25 dark:bg-accent/20 dark:border-accent/35',
    success:
      'bg-success/15 text-success border border-success/25 dark:bg-success/20 dark:border-success/30',
    warning:
      'bg-warning/15 text-warning border border-warning/25 dark:bg-warning/20 dark:border-warning/30',
    danger:
      'bg-danger/15 text-danger border border-danger/25 dark:bg-danger/20 dark:border-danger/30',
    info:
      'bg-info/15 text-info border border-info/25 dark:bg-info/20 dark:border-info/30',
    neutral:
      'bg-surface-2 text-text-muted border border-border-subtle dark:bg-surface-2 dark:text-text-muted',
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
