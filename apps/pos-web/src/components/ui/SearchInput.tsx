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
      placeholder = 'Scan barcode or search item...',
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

    return (
      <div className={`relative flex items-center w-full ${className}`}>
        <Search
          size={20}
          strokeWidth={1.75}
          className="absolute left-4 text-text-muted pointer-events-none select-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-h-[52px] rounded-xl bg-surface border border-border-subtle text-text-main placeholder:text-text-muted outline-none transition-all duration-fast pl-12 pr-20 shadow-soft focus:border-primary focus:ring-2 focus:ring-primary/20 text-[15px]"
          {...props}
        />
        <div className="absolute right-3.5 flex items-center gap-2 select-none">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-full text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors duration-fast cursor-pointer"
              aria-label="Clear search"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
          {shortcut && <KeyboardHint shortcut={shortcut} />}
        </div>
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
