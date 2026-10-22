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
      className={`min-h-[48px] px-5 py-2.5 rounded-full font-semibold text-sm transition-all flex items-center gap-2 select-none active:scale-[0.97] whitespace-nowrap ${
        active
          ? 'bg-gebeya-600 text-white shadow-sm ring-2 ring-gebeya-500/20'
          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/80'
      } ${className}`}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={`px-2 py-0.5 text-xs rounded-full ${
            active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
};
