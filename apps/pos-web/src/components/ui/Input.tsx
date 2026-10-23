import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftIcon, rightIcon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-semibold text-text-muted select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-text-dim">
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full min-h-[44px] px-3.5 py-2 text-sm bg-input text-text-main rounded-lg border transition-all duration-150 outline-none placeholder:text-text-dim ${
              leftIcon ? 'pl-10' : ''
            } ${rightIcon ? 'pr-10' : ''} ${
              error
                ? 'border-danger focus:ring-2 focus:ring-danger/20'
                : 'border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20'
            } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 flex items-center text-text-dim">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <span className="text-xs text-danger font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-text-muted">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
