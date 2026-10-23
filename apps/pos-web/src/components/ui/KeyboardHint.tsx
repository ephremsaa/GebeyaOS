import React from 'react';

export interface KeyboardHintProps extends React.HTMLAttributes<HTMLElement> {
  shortcut: string;
}

export const KeyboardHint: React.FC<KeyboardHintProps> = ({
  shortcut,
  className = '',
  ...props
}) => {
  return (
    <kbd
      className={`keyboard-hint hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded border border-border-subtle bg-elevated text-text-muted shadow-2xs select-none ${className}`}
      {...props}
    >
      {shortcut}
    </kbd>
  );
};
