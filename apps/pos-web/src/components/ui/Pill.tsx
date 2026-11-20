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
      className={`min-h-[42px] px-4 py-2 rounded-full font-semibold text-[14px] transition-all flex items-center gap-2 select-none active:scale-[0.98] whitespace-nowrap cursor-pointer ${
        active
          ? 'bg-primary text-white shadow-soft font-bold'
          : 'bg-surface text-text-muted hover:text-text-main hover:bg-surface-2 border border-border-subtle'
      } ${className}`}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={`px-2 py-0.5 text-xs rounded-full font-bold ${
            active ? 'bg-white/20 text-white' : 'bg-surface-2 text-text-muted'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
