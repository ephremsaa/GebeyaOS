import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, helperText, className = '', id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-semibold text-text-muted select-none">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            className={`w-full min-h-[44px] px-3.5 py-2 text-sm bg-input text-text-main rounded-lg border appearance-none transition-all duration-150 outline-none pr-10 ${
              error
                ? 'border-danger focus:ring-2 focus:ring-danger/20'
                : 'border-border-strong focus:border-primary focus:ring-2 focus:ring-primary/20'
            } disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3.5 pointer-events-none text-text-dim flex items-center">
            <ChevronDown size={16} />
          </div>
        </div>
        {error && <span className="text-xs text-danger font-medium">{error}</span>}
        {!error && helperText && <span className="text-xs text-text-muted">{helperText}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
