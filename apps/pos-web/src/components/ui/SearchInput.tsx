import React, { useRef, useImperativeHandle } from 'react';
import { Search, X } from 'lucide-react';
import { KeyboardHint } from './KeyboardHint';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  value: string;
  onValueChange: (val: string) => void;
  onClear?: () => void;
  onSearchSubmit?: () => void;
  shortcut?: string;
  size?: 'md' | 'lg';
}

export interface SearchInputHandle {
  focus: () => void;
  clear: () => void;
}

export const SearchInput = React.forwardRef<SearchInputHandle, SearchInputProps>(
  (
    {
      value,
      onValueChange,
      onClear,
      onSearchSubmit,
      shortcut = 'F2',
      placeholder = 'Search...',
      size = 'lg',
      className = '',
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        onValueChange('');
        onClear?.();
        inputRef.current?.focus();
      },
    }));

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onValueChange('');
      onClear?.();
      inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onSearchSubmit?.();
      } else if (e.key === 'Escape' && value) {
        e.preventDefault();
        onValueChange('');
        onClear?.();
      }
      props.onKeyDown?.(e);
    };

    const isLg = size === 'lg';

    return (
      <div className={`relative flex items-center w-full ${className}`}>
        <Search
          size={isLg ? 20 : 18}
          className="absolute left-3.5 text-text-dim pointer-events-none select-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full rounded-xl bg-surface border border-border-strong text-text-main placeholder:text-text-dim outline-none transition-all duration-150 pl-11 shadow-xs focus:border-primary focus:ring-2 focus:ring-primary/20 ${
            isLg ? 'min-h-[52px] text-base pr-20' : 'min-h-[44px] text-sm pr-16'
          }`}
          {...props}
        />
        <div className="absolute right-3 flex items-center gap-1.5 select-none">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-full text-text-dim hover:text-text-main hover:bg-elevated transition-colors"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
          {shortcut && <KeyboardHint shortcut={shortcut} />}
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
