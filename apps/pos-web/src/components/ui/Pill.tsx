import React from 'react';

export interface PillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  count?: number;
}

export const Pill: React.FC<PillProps> = ({
  active = false,
  count,
  children,
  className = '',
  ...props
}) => {
  return (
    <button
      type="button"
      className={`min-h-[44px] px-4 py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center gap-2 select-none active:scale-[0.98] whitespace-nowrap cursor-pointer ${
        active
          ? 'bg-primary text-white shadow-sm ring-2 ring-primary/25 font-bold'
          : 'bg-surface text-text-muted hover:text-text-main hover:bg-elevated border border-border-strong'
      } ${className}`}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={`px-1.5 py-0.2 text-[11px] rounded-full font-bold ${
            active ? 'bg-white/20 text-white' : 'bg-elevated text-text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
