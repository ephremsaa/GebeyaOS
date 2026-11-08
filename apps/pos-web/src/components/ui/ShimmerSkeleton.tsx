import React from 'react';

export interface ShimmerSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'pill';
  className?: string;
}

export const ShimmerSkeleton: React.FC<ShimmerSkeletonProps> = ({
  width,
  height,
  rounded = 'xl',
  className = '',
  style,
  ...props
}) => {
  const roundedClass = {
    sm: 'rounded-md',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    '2xl': 'rounded-3xl',
    '3xl': 'rounded-3xl',
    pill: 'rounded-full',
  }[rounded];

  return (
    <div
      className={`relative overflow-hidden bg-surface-2/80 dark:bg-surface-2/60 border border-border-subtle/40 ${roundedClass} ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.8s_infinite] bg-gradient-to-r from-transparent via-white/10 dark:via-white/5 to-transparent" />
    </div>
  );
};

export const CardSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`p-5 rounded-3xl bg-surface border border-border-subtle space-y-4 shadow-soft ${className}`}>
    <div className="flex items-center justify-between">
      <ShimmerSkeleton width="40%" height={16} rounded="md" />
      <ShimmerSkeleton width={36} height={36} rounded="xl" />
    </div>
    <ShimmerSkeleton width="60%" height={32} rounded="lg" />
    <div className="flex items-center gap-2 pt-2">
      <ShimmerSkeleton width={48} height={18} rounded="pill" />
      <ShimmerSkeleton width="30%" height={14} rounded="md" />
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 5,
  columns = 5,
  className = '',
}) => (
  <div className={`w-full rounded-2xl border border-border-subtle overflow-hidden bg-surface ${className}`}>
    <div className="p-3.5 bg-surface-2 border-b border-border-subtle flex gap-4">
      {Array.from({ length: columns }).map((_, i) => (
        <ShimmerSkeleton key={i} height={14} className="flex-1" rounded="md" />
      ))}
    </div>
    <div className="divide-y divide-border-subtle/50">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-3.5 flex gap-4 items-center">
          {Array.from({ length: columns }).map((_, c) => (
            <ShimmerSkeleton key={c} height={16} className="flex-1" rounded="md" />
          ))}
        </div>
      ))}
    </div>
  </div>
);
