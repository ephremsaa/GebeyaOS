import React from 'react';
import { useBrandTheme } from '../../theme/BrandThemeContext';

export interface AnimatedProgressBarProps {
  value: number;
  max?: number;
  variant?: 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  value,
  max = 100,
  variant = 'primary',
  size = 'md',
  showLabel = false,
  className = '',
}) => {
  const { animationMode } = useBrandTheme();
  const percentage = Math.max(0, Math.min(100, Math.round((value / max) * 100)));

  const sizeClasses = {
    xs: 'h-1',
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }[size];

  const barVariants = {
    primary: 'bg-primary',
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
  }[variant];

  const transitionStyle =
    animationMode === 'off'
      ? 'none'
      : animationMode === 'reduced'
      ? 'width 150ms linear'
      : 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)';

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between text-xs font-semibold mb-1 text-text-muted">
          <span>{percentage}%</span>
          <span className="font-mono tabular-nums text-[11px]">
            {value} / {max}
          </span>
        </div>
      )}
      <div className={`w-full bg-surface-2 dark:bg-surface-2 rounded-pill overflow-hidden border border-border-subtle/50 ${sizeClasses}`}>
        <div
          className={`h-full rounded-pill ${barVariants}`}
          style={{
            width: `${percentage}%`,
            transition: transitionStyle,
          }}
        />
      </div>
    </div>
  );
};

