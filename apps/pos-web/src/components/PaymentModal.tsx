import React, { useState, useEffect } from 'react';
import {
  Banknote,
  Smartphone,
  CreditCard,
  Building,
  CheckCircle2,
  Printer,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { Modal } from './ui/Modal';
import { NumberPad } from './ui/NumberPad';
import { Button } from './ui/Button';
import { playSuccessChime } from '../utils/sound';

export type PaymentMethodType = 'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'CARD' | 'BANK_TRANSFER';

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onCompleteSale: (details: {
    method: PaymentMethodType;
    amountPaid: number;
    change: number;
    refCode?: string;
  }) => void;
  onPrintReceipt?: () => void;
  onNewSale?: () => void;
  completedReceiptNo?: string | null;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  totalAmount,
  onCompleteSale,
  onPrintReceipt,
  onNewSale,
  completedReceiptNo,
}) => {
  const { t, formatCurrency } = useI18n();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('CASH');
  const [tenderedStr, setTenderedStr] = useState<string>('');
  const [refCode, setRefCode] = useState<string>('');

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen && !completedReceiptNo) {
      setTenderedStr(totalAmount.toFixed(2));
      setSelectedMethod('CASH');
      setRefCode('');
    }
  }, [isOpen, totalAmount, completedReceiptNo]);

  // Keyboard shortcut Enter for new sale when completed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (completedReceiptNo && e.key === 'Enter') {
        onNewSale?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completedReceiptNo, onNewSale]);

  const tenderedAmount = parseFloat(tenderedStr) || 0;
  const changeDue = Math.max(0, tenderedAmount - totalAmount);
  const remainingDue = Math.max(0, totalAmount - tenderedAmount);
  const isSufficient = selectedMethod !== 'CASH' || tenderedAmount >= totalAmount;

  const handleDigit = (digit: string) => {
    if (digit === '.' && tenderedStr.includes('.')) return;
    setTenderedStr((prev) => (prev === '0' && digit !== '.' ? digit : prev + digit));
  };

  const handleClear = () => {
    setTenderedStr('0');
  };

  const handleBackspace = () => {
    setTenderedStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handleExact = () => {
    setTenderedStr(totalAmount.toFixed(2));
  };

  const handleAddQuickCash = (amt: number) => {
    const current = parseFloat(tenderedStr) || 0;
    setTenderedStr((current + amt).toFixed(2));
  };

  const handleComplete = () => {
    if (!isSufficient) return;
    playSuccessChime();
    onCompleteSale({
      method: selectedMethod,
      amountPaid: selectedMethod === 'CASH' ? tenderedAmount : totalAmount,
      change: selectedMethod === 'CASH' ? changeDue : 0,
      refCode: refCode || undefined,
    });
  };

  const methods: { id: PaymentMethodType; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'CASH', label: t('cash'), icon: <Banknote size={20} />, color: 'text-emerald-600' },
    { id: 'TELEBIRR', label: t('telebirr'), icon: <Smartphone size={20} />, color: 'text-sky-600' },
    { id: 'CBE_BIRR', label: t('cbeBirr'), icon: <Smartphone size={20} />, color: 'text-amber-600' },
    { id: 'CARD', label: t('card'), icon: <CreditCard size={20} />, color: 'text-purple-600' },
    { id: 'BANK_TRANSFER', label: t('bankTransfer'), icon: <Building size={20} />, color: 'text-indigo-600' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={completedReceiptNo ? t('saleCompleted') : t('paymentTitle')}
      maxWidth="xl"
    >
      {completedReceiptNo ? (
        /* Success State */
        <div className="flex flex-col items-center justify-center py-6 text-center animate-in zoom-in-95 duration-150">
          <div className="w-20 h-20 rounded-full bg-gebeya-100 dark:bg-gebeya-950 text-gebeya-600 dark:text-gebeya-400 flex items-center justify-center mb-4">
            <CheckCircle2 size={44} />
          </div>

          <h3 className="text-2xl font-black text-slate-900 dark:text-white">
            {t('saleCompleted')}
          </h3>
          <p className="text-base text-slate-500 dark:text-slate-400 mt-1">
            {t('receiptNo')}: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{completedReceiptNo}</span>
          </p>

          <div className="my-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 w-full max-w-sm flex justify-between items-center text-sm">
            <span className="text-slate-500">{t('total')}:</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            <Button
              variant="outline"
              size="lg"
              leftIcon={<Printer size={20} />}
              onClick={onPrintReceipt}
            >
              {t('printReceipt')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<RotateCcw size={20} />}
              onClick={onNewSale}
            >
              {t('newSale')}
            </Button>
          </div>
        </div>
      ) : (
        /* Payment Selection & Cash Keypad */
        <div className="flex flex-col gap-5">
          {/* Top Amount Due Header */}
          <div className="p-4 rounded-2xl bg-gebeya-50 dark:bg-gebeya-950/40 border border-gebeya-200 dark:border-gebeya-900 flex items-center justify-between">
            <span className="text-sm font-bold text-gebeya-800 dark:text-gebeya-300">
              {t('amountDue')}
            </span>
            <span className="text-3xl font-black text-gebeya-700 dark:text-gebeya-300">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          {/* Payment Method Tabs (Big Buttons) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {methods.map((m) => {
              const isSelected = selectedMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethod(m.id)}
                  className={`min-h-[56px] rounded-2xl p-2 flex flex-col items-center justify-center gap-1 font-bold text-xs transition-all active:scale-95 border-2 ${
                    isSelected
                      ? 'border-gebeya-600 bg-gebeya-50 dark:bg-gebeya-950/60 text-gebeya-700 dark:text-gebeya-300 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span className={isSelected ? 'text-gebeya-600 dark:text-gebeya-400' : m.color}>
                    {m.icon}
                  </span>
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Method Details */}
          {selectedMethod === 'CASH' ? (
            <div className="flex flex-col gap-4">
              {/* Tendered and Change readouts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">
                    {t('amountTendered')}
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      {formatCurrency(tenderedAmount)}
                    </span>
                    <button
                      type="button"
                      onClick={handleExact}
                      className="px-2 py-1 rounded-md text-xs font-bold bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 active:scale-95"
                    >
                      {t('exact')}
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-semibold text-slate-400 block mb-1">
                    {remainingDue > 0 ? t('remainingDue') : t('changeDue')}
                  </span>
                  <span
                    className={`text-2xl font-black ${
                      remainingDue > 0
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {remainingDue > 0 ? formatCurrency(remainingDue) : formatCurrency(changeDue)}
                  </span>
                </div>
              </div>

              {/* NumberPad with quick additions */}
              <NumberPad
                onDigit={handleDigit}
                onClear={handleClear}
                onBackspace={handleBackspace}
                onQuickAmount={handleAddQuickCash}
                quickAmounts={[50, 100, 200, 500, 1000]}
                showDecimal={true}
              />
            </div>
          ) : (
            /* Digital Payments (Telebirr / CBE Birr / Bank Transfer / Card) */
            <div className="flex flex-col gap-4 py-4">
              <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900 flex items-center gap-3">
                <ShieldCheck size={28} className="text-sky-600 flex-shrink-0" />
                <div className="text-xs text-sky-800 dark:text-sky-300">
                  <span className="font-bold block text-sm mb-0.5">Offline-Ready Verification</span>
                  Cashier can accept confirmation SMS or QR code reference even if telecom data is momentarily slow.
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  {t('referenceCode')}
                </label>
                <input
                  type="text"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  placeholder={t('referenceOptional')}
                  className="min-h-[52px] px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-base focus:border-gebeya-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Complete Sale Action Button */}
          <Button
            size="xl"
            variant="primary"
            fullWidth
            onClick={handleComplete}
            disabled={!isSufficient}
            className="mt-2 shadow-lg shadow-gebeya-600/30"
          >
            {t('completeSale')} ({formatCurrency(totalAmount)})
          </Button>
        </div>
      )}
    </Modal>
  );
};
