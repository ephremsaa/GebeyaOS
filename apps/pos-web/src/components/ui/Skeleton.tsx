import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'rectangular' | 'circular' | 'text';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rectangular',
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const variantClasses = {
    rectangular: 'rounded-xl',
    circular: 'rounded-full',
    text: 'rounded-md h-4 my-1',
  }[variant];

  return (
    <div
      className={`animate-pulse bg-elevated border border-border-subtle/50 ${variantClasses} ${className}`}
      style={{
        width,
        height,
        ...style,
      }}
      {...props}
    />
  );
};
