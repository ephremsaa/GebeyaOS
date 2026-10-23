import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 select-none cursor-pointer ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[36px] px-3 text-xs gap-1.5',
    md: 'min-h-[44px] px-4 text-sm gap-2', // 44px touch target standard
    lg: 'min-h-[56px] px-6 text-base gap-2.5 font-bold', // 56px large target standard
    xl: 'min-h-[60px] px-8 text-lg gap-3 font-extrabold',
  };

  const normalizedVariant = variant === 'destructive' ? 'danger' : variant;

  const variantClasses: Record<string, string> = {
    primary:
      'bg-primary text-white hover:bg-primary-hover shadow-sm shadow-primary/25',
    secondary:
      'bg-elevated text-text-main hover:bg-surface border border-border-strong',
    danger:
      'bg-danger text-white hover:bg-danger-hover shadow-sm shadow-danger/25',
    ghost:
      'bg-transparent text-text-muted hover:text-text-main hover:bg-elevated',
    outline:
      'bg-transparent border-2 border-border-strong text-text-main hover:bg-elevated',
  };

  const selectedVariantClass = variantClasses[normalizedVariant] || variantClasses.primary;

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${selectedVariantClass} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="animate-spin text-current" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 18} />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
