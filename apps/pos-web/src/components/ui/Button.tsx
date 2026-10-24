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
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-fast select-none cursor-pointer ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary active:scale-[0.98] ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100';

  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'min-h-[38px] px-3 text-[13px] gap-1.5',
    md: 'min-h-[44px] px-4 text-[15px] gap-2', // 44px standard touch target
    lg: 'min-h-[56px] px-6 text-[16px] gap-2.5 font-bold', // 56px primary touch target
    xl: 'min-h-[64px] px-8 text-lg gap-3 font-extrabold',
  };

  const normalizedVariant = variant === 'destructive' ? 'danger' : variant;

  const variantClasses: Record<string, string> = {
    primary:
      'bg-primary text-white hover:bg-primary-hover shadow-soft',
    secondary:
      'bg-surface-2 text-text-main hover:bg-surface border border-border-subtle shadow-soft',
    danger:
      'bg-danger-soft text-danger hover:bg-danger hover:text-white',
    ghost:
      'bg-transparent text-text-muted hover:text-text-main hover:bg-surface-2',
    outline:
      'bg-transparent border border-border-subtle text-text-main hover:bg-surface-2',
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
