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
      className={`bg-surface border border-border-subtle rounded-xl shadow-card transition-all duration-150 ${
        interactive
          ? 'cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-[0.99]'
          : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
