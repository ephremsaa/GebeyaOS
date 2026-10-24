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
  Split,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { Modal, NumberPad, Button, Input } from './ui';
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
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [splitAmount, setSplitAmount] = useState<number>(0);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen && !completedReceiptNo) {
      setTenderedStr(totalAmount.toFixed(2));
      setSelectedMethod('CASH');
      setRefCode('');
      setIsSplitMode(false);
      setSplitAmount(0);
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
  const targetDue = isSplitMode ? totalAmount - splitAmount : totalAmount;
  const changeDue = Math.max(0, tenderedAmount - targetDue);
  const remainingDue = Math.max(0, targetDue - tenderedAmount);
  const isSufficient = selectedMethod !== 'CASH' || tenderedAmount >= targetDue;

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
    setTenderedStr(targetDue.toFixed(2));
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

  const methods: { id: PaymentMethodType; label: string; icon: React.ReactNode }[] = [
    { id: 'CASH', label: t('cash'), icon: <Banknote size={20} strokeWidth={1.75} /> },
    { id: 'TELEBIRR', label: t('telebirr'), icon: <Smartphone size={20} strokeWidth={1.75} /> },
    { id: 'CBE_BIRR', label: t('cbeBirr'), icon: <Smartphone size={20} strokeWidth={1.75} /> },
    { id: 'CARD', label: t('card'), icon: <CreditCard size={20} strokeWidth={1.75} /> },
    { id: 'BANK_TRANSFER', label: t('bankTransfer'), icon: <Building size={20} strokeWidth={1.75} /> },
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
        <div className="flex flex-col items-center justify-center py-6 text-center animate-in zoom-in-95 duration-200">
          <div className="w-20 h-20 rounded-full bg-primary-soft text-primary flex items-center justify-center mb-4">
            <CheckCircle2 size={44} strokeWidth={1.75} />
          </div>

          <h3 className="text-2xl font-bold text-text-main">
            {t('saleCompleted')}
          </h3>
          <p className="text-[15px] text-text-muted mt-1">
            {t('receiptNo')}: <span className="font-mono font-bold text-text-main">{completedReceiptNo}</span>
          </p>

          <div className="my-6 p-4 rounded-xl bg-surface-2 border border-border-subtle w-full max-w-sm flex justify-between items-center text-sm shadow-soft">
            <span className="text-text-muted">{t('total')}:</span>
            <span className="text-2xl font-bold text-text-main tabular-nums font-mono">
              {formatCurrency(totalAmount)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            <Button
              variant="secondary"
              size="lg"
              leftIcon={<Printer size={20} strokeWidth={1.75} />}
              onClick={onPrintReceipt}
            >
              {t('printReceipt')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<RotateCcw size={20} strokeWidth={1.75} />}
              onClick={onNewSale}
            >
              {t('newSale')}
            </Button>
          </div>
        </div>
      ) : (
        /* Payment Selection & Cash Keypad */
        <div className="flex flex-col gap-4">
          {/* Top Amount Due Header */}
          <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between shadow-soft">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                {t('amountDue')}
              </span>
              {isSplitMode && (
                <span className="text-xs text-primary font-semibold">
                  Split: {formatCurrency(splitAmount)} paid
                </span>
              )}
            </div>
            <span className="text-3xl font-bold text-text-main tabular-nums font-mono">
              {formatCurrency(targetDue)}
            </span>
          </div>

          {/* Large Method Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {methods.map((m) => {
              const isSelected = selectedMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMethod(m.id)}
                  className={`min-h-[56px] rounded-xl p-2.5 flex flex-col items-center justify-center gap-1.5 font-semibold text-[13px] transition-all duration-fast active:scale-95 border cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary-soft text-primary shadow-soft'
                      : 'border-border-subtle bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main'
                  }`}
                >
                  <span>{m.icon}</span>
                  <span className="truncate max-w-full">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Split Payment Toggle */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => {
                setIsSplitMode(!isSplitMode);
                if (!isSplitMode) {
                  setSplitAmount(Math.round(totalAmount / 2));
                } else {
                  setSplitAmount(0);
                }
              }}
              className="text-xs font-medium text-text-muted hover:text-primary flex items-center gap-1.5 cursor-pointer"
            >
              <Split size={14} strokeWidth={1.75} />
              <span>{isSplitMode ? 'Cancel Split Payment' : t('splitPayment')}</span>
            </button>
          </div>

          {/* Method Details */}
          {selectedMethod === 'CASH' ? (
            <div className="flex flex-col gap-3">
              {/* Tendered and Change readouts */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-surface border border-border-subtle shadow-soft">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-text-muted">
                      {t('amountTendered')}
                    </span>
                    <button
                      type="button"
                      onClick={handleExact}
                      className="px-2 py-0.5 rounded text-xs font-bold bg-surface-2 hover:bg-border-subtle text-text-main cursor-pointer"
                    >
                      {t('exact')}
                    </button>
                  </div>
                  <span className="text-2xl font-bold text-text-main tabular-nums font-mono block">
                    {formatCurrency(tenderedAmount)}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-surface border border-border-subtle shadow-soft">
                  <span className="text-xs font-semibold text-text-muted block mb-1">
                    {remainingDue > 0 ? t('remainingDue') : t('changeDue')}
                  </span>
                  <span
                    className={`text-2xl font-bold tabular-nums font-mono block ${
                      remainingDue > 0
                        ? 'text-warning'
                        : 'text-primary'
                    }`}
                  >
                    {remainingDue > 0 ? formatCurrency(remainingDue) : formatCurrency(changeDue)}
                  </span>
                </div>
              </div>

              {/* NumberPad with quick additions & 64px keys */}
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
            <div className="flex flex-col gap-3 py-2">
              <div className="p-4 rounded-xl bg-info-soft/40 border border-info/20 flex items-center gap-3">
                <ShieldCheck size={24} strokeWidth={1.75} className="text-info flex-shrink-0" />
                <div className="text-[13px] text-text-muted">
                  <span className="font-semibold block text-text-main mb-0.5">Offline-Ready Verification</span>
                  Cashier can accept confirmation SMS or reference code even if telecom data is momentarily slow.
                </div>
              </div>

              <Input
                label={t('referenceCode')}
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                placeholder={t('referenceOptional')}
                className="font-mono text-base"
              />
            </div>
          )}

          {/* Complete Sale Action Button */}
          <Button
            size="lg"
            variant="primary"
            fullWidth
            onClick={handleComplete}
            disabled={!isSufficient}
            className="mt-1"
          >
            {t('completeSale')} · {formatCurrency(targetDue)}
          </Button>
        </div>
      )}
    </Modal>
  );
};
