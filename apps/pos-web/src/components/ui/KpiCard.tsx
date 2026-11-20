import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { IconTile, IconTileVariant } from './IconTile';
import { Card } from './Card';
import { CountUpNumber } from './CountUpNumber';

export interface KpiCardProps {
  title: string;
  value: string | number;
  numericValue?: number;
  prefix?: string;
  suffix?: string;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  iconVariant?: IconTileVariant;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  numericValue,
  prefix,
  suffix,
  change,
  changeLabel,
  icon,
  iconVariant = 'primary',
  isLoading = false,
  onClick,
  className = '',
}) => {
  if (isLoading) {
    return (
      <Card className={`p-5 flex flex-col justify-between ${className}`}>
        <div className="flex items-start justify-between">
          <div className="h-4 w-28 bg-surface-2 animate-pulse rounded-md" />
          <div className="w-11 h-11 bg-surface-2 animate-pulse rounded-xl" />
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-8 w-36 bg-surface-2 animate-pulse rounded-md" />
          <div className="h-3.5 w-24 bg-surface-2 animate-pulse rounded-md" />
        </div>
      </Card>
    );
  }

  const isPositive = typeof change === 'number' && change > 0;
  const isNegative = typeof change === 'number' && change < 0;

  return (
    <Card
      interactive={!!onClick}
      onClick={onClick}
      className={`p-5 flex flex-col justify-between min-h-[136px] ${className}`}
    >
      {/* Top row: Title and colored soft Icon Tile */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14px] font-semibold text-text-muted leading-tight truncate">
          {title}
        </span>
        <IconTile icon={icon} variant={iconVariant} size="md" />
      </div>

      {/* Middle row: Large 28-30px Value */}
      <div className="mt-3">
        <div className="text-[28px] xl:text-[30px] font-black tracking-tight text-text-main font-mono tabular-nums leading-none">
          {typeof numericValue === 'number' ? (
            <CountUpNumber value={numericValue} prefix={prefix} suffix={suffix} />
          ) : (
            <span>{value}</span>
          )}
        </div>

        {/* Bottom row: Percentage change indicator vs previous period */}
        {change !== undefined && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[13px] font-semibold">
            <span
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                isPositive
                  ? 'bg-primary-soft text-primary'
                  : isNegative
                  ? 'bg-danger-soft text-danger'
                  : 'bg-surface-2 text-text-muted'
              }`}
            >
              {isPositive && <ArrowUpRight size={13} strokeWidth={2.5} />}
              {isNegative && <ArrowDownRight size={13} strokeWidth={2.5} />}
              {!isPositive && !isNegative && <Minus size={13} />}
              <span>{Math.abs(change).toFixed(1)}%</span>
            </span>
            {changeLabel && (
              <span className="text-text-muted text-xs truncate">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
