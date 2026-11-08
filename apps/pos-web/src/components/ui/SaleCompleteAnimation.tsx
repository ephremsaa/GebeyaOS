import React, { useEffect } from 'react';
import { Printer, PlusCircle, Check, ArrowRight } from 'lucide-react';
import { useBrandTheme } from '../../theme/BrandThemeContext';
import { CountUpNumber } from './CountUpNumber';

export interface SaleCompleteAnimationProps {
  receiptNumber: string;
  totalAmount: number;
  amountTendered: number;
  changeAmount: number;
  paymentMethod: string;
  currencySymbol?: string;
  onPrintReceipt: () => void;
  onNewSale: () => void;
  language?: 'en' | 'am';
}

export const SaleCompleteAnimation: React.FC<SaleCompleteAnimationProps> = ({
  receiptNumber,
  totalAmount,
  amountTendered,
  changeAmount,
  paymentMethod,
  currencySymbol = 'ETB',
  onPrintReceipt,
  onNewSale,
  language = 'en',
}) => {
  const { animationMode } = useBrandTheme();

  // Handle Enter/Space for instant New Sale
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onNewSale();
      } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onPrintReceipt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewSale, onPrintReceipt]);

  return (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none anim-pop-in">
      {/* Animated Checkmark Circle */}
      <div className="relative mb-5 flex items-center justify-center">
        {animationMode === 'full' && (
          <span className="animate-ping absolute inline-flex h-20 w-20 rounded-full bg-success/20 opacity-75" />
        )}
        <div className="relative w-20 h-20 rounded-full bg-success/15 border-2 border-success flex items-center justify-center text-success shadow-lg shadow-success/20">
          <Check size={40} className="stroke-[3]" />
        </div>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-black text-text-main tracking-tight">
        {language === 'am' ? 'ሽያጩ በተሳካ ሁኔታ ተጠናቋል!' : 'Sale Completed Successfully!'}
      </h2>
      <p className="text-xs font-mono font-semibold text-text-muted mt-1">
        {language === 'am' ? 'ደረሰኝ ቁጥር' : 'Receipt'} #{receiptNumber} · {paymentMethod}
      </p>

      {/* Prominent Change Due Card */}
      {changeAmount > 0 ? (
        <div className="w-full max-w-sm mt-6 p-4 rounded-3xl bg-success/10 border-2 border-success/30 flex flex-col items-center justify-center gap-1 shadow-soft">
          <span className="text-xs font-bold uppercase tracking-wider text-success">
            {language === 'am' ? 'የሚመለስ ተመላሽ ገንዘብ' : 'Change Due to Customer'}
          </span>
          <div className="text-4xl font-black text-success tracking-tight">
            <CountUpNumber
              value={changeAmount}
              decimals={2}
              suffix={` ${currencySymbol}`}
              duration={600}
            />
          </div>
          <span className="text-[11px] text-text-muted mt-1 font-mono">
            {language === 'am' ? 'የተከፈለው' : 'Tendered'}: {amountTendered.toFixed(2)} {currencySymbol} · {language === 'am' ? 'ድምር' : 'Total'}: {totalAmount.toFixed(2)} {currencySymbol}
          </span>
        </div>
      ) : (
        <div className="w-full max-w-sm mt-6 p-4 rounded-3xl bg-surface-2 border border-border-subtle flex flex-col items-center justify-center gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
            {language === 'am' ? 'የተከፈለው ጠቅላላ ድምር' : 'Total Paid (Exact)'}
          </span>
          <div className="text-3xl font-black text-text-main tracking-tight">
            <CountUpNumber
              value={totalAmount}
              decimals={2}
              suffix={` ${currencySymbol}`}
              duration={500}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="w-full max-w-sm grid grid-cols-2 gap-3 mt-7">
        <button
          type="button"
          onClick={onPrintReceipt}
          className="px-4 py-3 rounded-2xl bg-surface-2 hover:bg-surface text-text-main border border-border-subtle font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-2xs cursor-pointer"
        >
          <Printer size={16} className="text-primary" />
          <span>{language === 'am' ? 'ደረሰኝ አትም (P)' : 'Print Receipt (P)'}</span>
        </button>

        <button
          type="button"
          onClick={onNewSale}
          className="px-4 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-soft shadow-primary/30 cursor-pointer"
        >
          <span>{language === 'am' ? 'አዲስ ሽያጭ (Enter)' : 'New Sale (Enter)'}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

