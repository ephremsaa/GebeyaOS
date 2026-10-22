import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface StatusDotProps {
  status: 'online' | 'offline' | 'syncing';
  label?: string;
  cashierName?: string;
  onClick?: () => void;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  cashierName,
  onClick,
}) => {
  const dotColor = {
    online: 'bg-emerald-500 shadow-emerald-500/50',
    offline: 'bg-amber-500 shadow-amber-500/50',
    syncing: 'bg-blue-500 animate-pulse',
  }[status];

  return (
    <button
      onClick={onClick}
      className="min-h-[40px] px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 select-none active:scale-95"
    >
      <span className="relative flex h-2.5 w-2.5">
        {status === 'online' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
      </span>
      {cashierName && <span className="font-semibold text-slate-800 dark:text-slate-100">{cashierName}</span>}
      <ChevronDown size={14} className="text-slate-400" />
    </button>
  );
};
