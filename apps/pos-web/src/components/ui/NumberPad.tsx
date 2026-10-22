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
    <div className="flex flex-col gap-3 w-full">
      {/* Quick Cash Buttons */}
      {onQuickAmount && quickAmounts && quickAmounts.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => onQuickAmount(amt)}
              className="min-h-[46px] rounded-xl font-bold text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 active:scale-95 transition-all border border-slate-200 dark:border-slate-700"
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
            className="min-h-[58px] rounded-2xl font-bold text-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-gebeya-500 hover:bg-gebeya-50/50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm active:scale-95 transition-all flex items-center justify-center"
          >
            {num}
          </button>
        ))}

        {/* Clear Button */}
        <button
          type="button"
          onClick={onClear}
          className="min-h-[58px] rounded-2xl font-bold text-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 active:scale-95 transition-all flex items-center justify-center"
        >
          C
        </button>

        {/* Zero */}
        <button
          type="button"
          onClick={() => onDigit('0')}
          className="min-h-[58px] rounded-2xl font-bold text-2xl bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 hover:border-gebeya-500 hover:bg-gebeya-50/50 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm active:scale-95 transition-all flex items-center justify-center"
        >
          0
        </button>

        {/* Decimal or Backspace */}
        {showDecimal ? (
          <button
            type="button"
            onClick={() => onDigit('.')}
            className="min-h-[58px] rounded-2xl font-bold text-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center"
          >
            .
          </button>
        ) : (
          <button
            type="button"
            onClick={onBackspace}
            className="min-h-[58px] rounded-2xl font-bold text-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all flex items-center justify-center"
          >
            <Delete size={22} />
          </button>
        )}
      </div>

      {showDecimal && (
        <button
          type="button"
          onClick={onBackspace}
          className="min-h-[46px] rounded-xl font-semibold text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 active:scale-95 transition-all border border-slate-200 dark:border-slate-700"
        >
          <Delete size={18} />
          <span>Backspace</span>
        </button>
      )}
    </div>
  );
};
