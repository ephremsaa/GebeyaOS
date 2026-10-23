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
    online: 'bg-primary shadow-xs shadow-primary/50',
    offline: 'bg-warning shadow-xs shadow-warning/50',
    syncing: 'bg-info animate-pulse',
  }[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-elevated hover:bg-surface transition-all flex items-center gap-2 text-xs font-semibold text-text-main border border-border-strong select-none active:scale-95 cursor-pointer"
    >
      <span className="relative flex h-2.5 w-2.5">
        {status === 'online' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        )}
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}`} />
      </span>
      {cashierName && <span className="font-bold text-text-main">{cashierName}</span>}
      <ChevronDown size={14} className="text-text-dim" />
    </button>
  );
};
