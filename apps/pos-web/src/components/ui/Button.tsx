import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all select-none active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100';

  const sizeClasses = {
    sm: 'h-10 px-3 text-sm gap-1.5 min-w-[40px]',
    md: 'min-h-[48px] px-4 text-base gap-2 min-w-[48px]', // 48px touch target minimum
    lg: 'min-h-[54px] px-6 text-lg gap-2.5 min-w-[54px]',
    xl: 'min-h-[64px] px-8 text-xl gap-3 font-bold min-w-[64px]',
  }[size];

  const variantClasses = {
    primary:
      'bg-gebeya-600 hover:bg-gebeya-700 active:bg-gebeya-800 text-white shadow-sm focus-visible:ring-gebeya-500',
    secondary:
      'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 focus-visible:ring-slate-400',
    outline:
      'border-2 border-slate-200 hover:border-slate-300 bg-transparent text-slate-700 dark:border-slate-700 dark:hover:border-slate-600 dark:text-slate-200 focus-visible:ring-slate-400',
    destructive:
      'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm focus-visible:ring-red-500',
    ghost:
      'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 dark:hover:bg-slate-800 dark:text-slate-300 focus-visible:ring-slate-400',
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
