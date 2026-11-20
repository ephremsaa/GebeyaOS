import React from 'react';
import { Delete } from 'lucide-react';

export interface NumberPadProps {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onQuickAmount?: (amount: number) => void;
  quickAmounts?: number[];
  showDecimal?: boolean;
  compact?: boolean;
}

export const NumberPad: React.FC<NumberPadProps> = ({
  onDigit,
  onClear,
  onBackspace,
  onQuickAmount,
  quickAmounts = [50, 100, 200, 500, 1000],
  showDecimal = true,
  compact = false,
}) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const keyHeight = compact ? 'h-9 sm:h-10 min-h-0' : 'min-h-[58px] sm:min-h-[64px]';
  const quickHeight = compact ? 'h-7 sm:h-8 min-h-0 text-xs' : 'min-h-[44px] text-xs sm:text-sm';

  return (
    <div className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2.5'} w-full select-none`}>
      {/* Quick Cash Buttons */}
      {onQuickAmount && quickAmounts && quickAmounts.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onQuickAmount(amt)}
              className={`${quickHeight} rounded-xl font-bold bg-surface-2 hover:bg-surface text-text-main active:scale-95 transition-all duration-fast border border-border-subtle cursor-pointer shadow-soft flex items-center justify-center`}
            >
              +{amt}
            </button>
          ))}
        </div>
      )}

      {/* 3x4 Numeric Keypad */}
      <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {digits.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onDigit(num)}
            className={`${keyHeight} rounded-xl font-bold ${compact ? 'text-lg' : 'text-xl sm:text-2xl'} tabular-nums bg-surface border border-border-subtle hover:border-primary hover:bg-primary-soft/30 text-text-main shadow-soft active:scale-[0.98] transition-all duration-fast flex items-center justify-center cursor-pointer`}
          >
            {num}
          </button>
        ))}

        {/* Clear Button */}
        <button
          type="button"
          onClick={onClear}
          className={`${keyHeight} rounded-xl font-bold ${compact ? 'text-xs' : 'text-base sm:text-lg'} bg-danger-soft hover:bg-danger hover:text-white text-danger border border-transparent active:scale-[0.98] transition-all duration-fast flex items-center justify-center cursor-pointer`}
        >
          C
        </button>

        {/* Zero */}
        <button
          type="button"
          onClick={() => onDigit('0')}
          className={`${keyHeight} rounded-xl font-bold ${compact ? 'text-lg' : 'text-xl sm:text-2xl'} tabular-nums bg-surface border border-border-subtle hover:border-primary hover:bg-primary-soft/30 text-text-main shadow-soft active:scale-[0.98] transition-all duration-fast flex items-center justify-center cursor-pointer`}
        >
          0
        </button>

        {/* Decimal */}
        {showDecimal ? (
          <button
            type="button"
            onClick={() => onDigit('.')}
            className={`${keyHeight} rounded-xl font-bold ${compact ? 'text-lg' : 'text-xl sm:text-2xl'} bg-surface-2 hover:bg-surface text-text-main border border-border-subtle active:scale-[0.98] transition-all duration-fast flex items-center justify-center cursor-pointer`}
          >
            .
          </button>
        ) : (
          <button
            type="button"
            onClick={onBackspace}
            className={`${keyHeight} rounded-xl font-bold text-lg bg-surface-2 hover:bg-surface text-text-muted hover:text-text-main border border-border-subtle active:scale-[0.98] transition-all duration-fast flex items-center justify-center cursor-pointer`}
            aria-label="Backspace"
          >
            <Delete size={20} />
          </button>
        )}
      </div>

      {showDecimal && (
        <button
          type="button"
          onClick={onBackspace}
          className={`${compact ? 'h-7 sm:h-7.5 min-h-0 text-xs py-0.5' : 'min-h-[44px] text-sm'} rounded-xl font-semibold bg-surface-2 hover:bg-surface text-text-muted hover:text-text-main flex items-center justify-center gap-2 active:scale-95 transition-all duration-fast border border-border-subtle cursor-pointer`}
        >
          <Delete size={15} />
          <span>Backspace</span>
        </button>
      )}
    </div>
  );
};
