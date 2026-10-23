import React from 'react';

export interface SegmentedControlOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options,
  value,
  onChange,
  className = '',
}) => {
  return (
    <div
      role="tablist"
      className={`inline-flex p-1 rounded-xl bg-elevated border border-border-subtle select-none ${className}`}
    >
      {options.map((opt) => {
        const isActive = opt.id === value;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all duration-150 cursor-pointer ${
              isActive
                ? 'bg-surface text-text-main shadow-xs font-bold'
                : 'text-text-muted hover:text-text-main hover:bg-surface/50'
            }`}
          >
            {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-primary/15 text-primary' : 'bg-elevated text-text-dim'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
