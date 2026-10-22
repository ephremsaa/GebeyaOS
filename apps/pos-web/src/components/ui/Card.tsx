import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  interactive = false,
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm ${
        interactive
          ? 'cursor-pointer hover:border-gebeya-500 hover:shadow-md active:scale-[0.98] transition-all'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
