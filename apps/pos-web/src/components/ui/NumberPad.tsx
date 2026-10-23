import React from 'react';
import { Delete } from 'lucide-react';

export interface NumberPadProps {
  onDigit: (digit: string) => void;
  onClear: () => void;
  onBackspace: () => void;
  onQuickAmount?: (amount: number) => void;
  quickAmounts?: number[];
  showDecimal?: boolean;
}

export const NumberPad: React.FC<NumberPadProps> = ({
  onDigit,
  onClear,
  onBackspace,
  onQuickAmount,
  quickAmounts = [50, 100, 200, 500, 1000],
  showDecimal = true,
}) => {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="flex flex-col gap-3 w-full select-none">
      {/* Quick Cash Buttons */}
      {onQuickAmount && quickAmounts && quickAmounts.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onQuickAmount(amt)}
              className="min-h-[46px] rounded-xl font-bold text-xs sm:text-sm bg-elevated hover:bg-surface text-text-main active:scale-95 transition-all border border-border-strong cursor-pointer"
            >
              +{amt}
            </button>
          ))}
        </div>
      )}

      {/* 3x4 Numeric Keypad */}
      <div className="grid grid-cols-3 gap-2.5">
        {digits.map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onDigit(num)}
            className="min-h-[58px] rounded-xl font-bold text-2xl tabular-nums bg-surface border border-border-strong hover:border-primary hover:bg-primary/5 text-text-main shadow-xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            {num}
          </button>
        ))}

        {/* Clear Button */}
        <button
          type="button"
          onClick={onClear}
          className="min-h-[58px] rounded-xl font-bold text-lg bg-danger/10 hover:bg-danger/20 text-danger border border-danger/25 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          C
        </button>

        {/* Zero */}
        <button
          type="button"
          onClick={() => onDigit('0')}
          className="min-h-[58px] rounded-xl font-bold text-2xl tabular-nums bg-surface border border-border-strong hover:border-primary hover:bg-primary/5 text-text-main shadow-xs active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          0
        </button>

        {/* Decimal or Backspace */}
        {showDecimal ? (
          <button
            type="button"
            onClick={() => onDigit('.')}
            className="min-h-[58px] rounded-xl font-bold text-2xl bg-elevated hover:bg-surface text-text-main border border-border-strong active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          >
            .
          </button>
        ) : (
          <button
            type="button"
            onClick={onBackspace}
            className="min-h-[58px] rounded-xl font-bold text-lg bg-elevated hover:bg-surface text-text-muted hover:text-text-main border border-border-strong active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            aria-label="Backspace"
          >
            <Delete size={22} />
          </button>
        )}
      </div>

      {showDecimal && (
        <button
          type="button"
          onClick={onBackspace}
          className="min-h-[46px] rounded-xl font-semibold text-sm bg-elevated hover:bg-surface text-text-muted hover:text-text-main flex items-center justify-center gap-2 active:scale-95 transition-all border border-border-strong cursor-pointer"
        >
          <Delete size={18} />
          <span>Backspace</span>
        </button>
      )}
    </div>
  );
};
