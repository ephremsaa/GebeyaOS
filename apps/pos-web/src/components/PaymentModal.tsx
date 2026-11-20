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
  Plus,
  Trash2,
  Loader2,
  Check,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { Modal, NumberPad, Button, Input } from './ui';
import { playSuccessChime } from '../utils/sound';
import { round2 } from '@gebeyaos/shared-types';

export type PaymentMethodType = 'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'CARD' | 'BANK_TRANSFER';

export interface PaymentLine {
  method: PaymentMethodType;
  amount: number;
  reference?: string;
}

export interface CompleteSaleDetails {
  method: PaymentMethodType;
  amountPaid: number;
  change: number;
  refCode?: string;
  payments: PaymentLine[];
}

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalAmount: number;
  onCompleteSale: (details: CompleteSaleDetails) => Promise<void> | void;
  onPrintReceipt?: () => void;
  onNewSale?: () => void;
  completedReceiptNo?: string | null;
  isSubmitting?: boolean;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  totalAmount,
  onCompleteSale,
  onPrintReceipt,
  onNewSale,
  completedReceiptNo,
  isSubmitting = false,
}) => {
  const { t, language, formatCurrency } = useI18n();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodType>('CASH');
  const [tenderedStr, setTenderedStr] = useState<string>('');
  const [refCode, setRefCode] = useState<string>('');
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [splitPayments, setSplitPayments] = useState<PaymentLine[]>([]);

  // Reset or initialize on modal open
  useEffect(() => {
    if (isOpen && !completedReceiptNo) {
      setTenderedStr(totalAmount.toFixed(2));
      setSelectedMethod('CASH');
      setRefCode('');
      setIsSplitMode(false);
      setSplitPayments([]);
    }
  }, [isOpen, totalAmount, completedReceiptNo]);

  const tenderedAmount = parseFloat(tenderedStr) || 0;
  const recordedSplitTotal = round2(splitPayments.reduce((sum, p) => sum + p.amount, 0));
  const remainingTarget = Math.max(0, round2(totalAmount - recordedSplitTotal));

  // If in split mode, target is the remaining balance
  const currentTarget = isSplitMode ? remainingTarget : totalAmount;
  const changeDue = selectedMethod === 'CASH' ? Math.max(0, round2(tenderedAmount - currentTarget)) : 0;
  const remainingDue = Math.max(0, round2(currentTarget - tenderedAmount));

  // Determine if payment can be finalized
  const isSufficient = isSplitMode
    ? remainingTarget === 0 || (tenderedAmount >= remainingTarget)
    : selectedMethod !== 'CASH' || tenderedAmount >= totalAmount;

  // Keyboard shortcut F4 and Enter to finalize sale
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (completedReceiptNo && e.key === 'Enter') {
        e.preventDefault();
        onNewSale?.();
        return;
      }

      if ((e.key === 'F4' || (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'INPUT')) && !completedReceiptNo) {
        if (isSufficient && !isSubmitting) {
          e.preventDefault();
          handleComplete();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, completedReceiptNo, isSufficient, isSubmitting, tenderedAmount, currentTarget, selectedMethod]);

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
    setTenderedStr(currentTarget.toFixed(2));
  };

  const handleAddQuickCash = (amt: number) => {
    const current = parseFloat(tenderedStr) || 0;
    setTenderedStr((current + amt).toFixed(2));
  };

  const handleAddSplitTender = () => {
    const amtToAdd = round2(selectedMethod === 'CASH' ? Math.min(tenderedAmount, currentTarget) : currentTarget);
    if (amtToAdd <= 0) return;

    setSplitPayments((prev) => [
      ...prev,
      {
        method: selectedMethod,
        amount: amtToAdd,
        reference: refCode || undefined,
      },
    ]);

    const newRemaining = Math.max(0, round2(currentTarget - amtToAdd));
    setTenderedStr(newRemaining.toFixed(2));
    setRefCode('');
  };

  const handleRemoveSplitTender = (idx: number) => {
    const removed = splitPayments[idx];
    setSplitPayments((prev) => prev.filter((_, i) => i !== idx));
    const newRemaining = round2(remainingTarget + removed.amount);
    setTenderedStr(newRemaining.toFixed(2));
  };

  const handleComplete = async () => {
    if (!isSufficient || isSubmitting) return;
    playSuccessChime();

    let finalPayments: PaymentLine[] = [];
    let finalAmountPaid = 0;
    let finalChange = 0;

    if (isSplitMode && splitPayments.length > 0) {
      if (remainingTarget > 0) {
        finalPayments = [
          ...splitPayments,
          {
            method: selectedMethod,
            amount: selectedMethod === 'CASH' ? tenderedAmount : remainingTarget,
            reference: refCode || undefined,
          },
        ];
      } else {
        finalPayments = [...splitPayments];
      }
      finalAmountPaid = round2(finalPayments.reduce((sum, p) => sum + p.amount, 0));
      finalChange = changeDue;
    } else {
      const paid = selectedMethod === 'CASH' ? tenderedAmount : totalAmount;
      finalPayments = [
        {
          method: selectedMethod,
          amount: paid,
          reference: refCode || undefined,
        },
      ];
      finalAmountPaid = paid;
      finalChange = changeDue;
    }

    await onCompleteSale({
      method: finalPayments[0]?.method || selectedMethod,
      amountPaid: finalAmountPaid,
      change: finalChange,
      refCode: refCode || undefined,
      payments: finalPayments,
    });
  };

  // 4 Payment Methods (Removed CBE Birr as requested)
  const methods: { id: PaymentMethodType; label: string; icon: React.ReactNode }[] = [
    { id: 'CASH', label: t('cash'), icon: <Banknote size={19} strokeWidth={2} /> },
    { id: 'TELEBIRR', label: t('telebirr'), icon: <Smartphone size={19} strokeWidth={2} /> },
    { id: 'CARD', label: t('card'), icon: <CreditCard size={19} strokeWidth={2} /> },
    { id: 'BANK_TRANSFER', label: t('bankTransfer'), icon: <Building size={19} strokeWidth={2} /> },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={completedReceiptNo ? t('saleCompleted') : t('paymentTitle')}
      maxWidth="3xl"
      bodyPadding="p-3.5 sm:p-4"
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
        /* 2-Column POS Payment Screen (Zero Scrolling, Fits 100% on Screen) */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          {/* ─── Left Column (6 cols): Payment Breakdown, Methods & Complete Sale Button ─── */}
          <div className="md:col-span-6 flex flex-col justify-between gap-3.5">
            {/* 1. Total Amount Due Card */}
            <div className="p-3.5 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-between shadow-soft">
              <div>
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                  {t('amountDue')}
                </span>
                {isSplitMode && (
                  <span className="text-xs text-primary font-bold">
                    {t('checkout.splitPaidProgress', { paid: formatCurrency(recordedSplitTotal), total: formatCurrency(totalAmount) })}
                  </span>
                )}
              </div>
              <span className="text-3xl font-extrabold text-text-main tabular-nums font-mono">
                {formatCurrency(currentTarget)}
              </span>
            </div>

            {/* 2. Payment Method Selector (4 Methods in 2x2 Clean Grid) */}
            <div>
              <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                {language === 'am' ? 'የክፍያ ዘዴ' : 'Payment Method'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                {methods.map((m) => {
                  const isSelected = selectedMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelectedMethod(m.id);
                        if (m.id !== 'CASH') {
                          setTenderedStr(currentTarget.toFixed(2));
                        }
                      }}
                      className={`min-h-[46px] rounded-xl px-3 py-2 flex items-center justify-center gap-2 font-bold text-[13px] transition-all duration-fast active:scale-95 border cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-primary text-white shadow-soft'
                          : 'border-border-subtle bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main'
                      }`}
                    >
                      <span>{m.icon}</span>
                      <span className="truncate">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Tendered & Change / Remaining Display (when Cash) OR Digital Reference */}
            {selectedMethod === 'CASH' ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Tendered Amount */}
                  <div className="p-3 rounded-xl bg-surface border border-border-subtle shadow-soft">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold text-text-muted uppercase tracking-wide">
                        {t('amountTendered')}
                      </span>
                      <button
                        type="button"
                        onClick={handleExact}
                        className="px-2 py-0.5 rounded text-[11px] font-bold bg-primary-soft text-primary hover:bg-primary-soft/80 cursor-pointer"
                      >
                        {t('exact')}
                      </button>
                    </div>
                    <span className="text-xl font-extrabold text-text-main tabular-nums font-mono block">
                      {formatCurrency(tenderedAmount)}
                    </span>
                  </div>

                  {/* Change Due / Remaining */}
                  <div className="p-3 rounded-xl bg-surface border border-border-subtle shadow-soft">
                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wide block mb-1">
                      {remainingDue > 0 ? t('remainingDue') : t('changeDue')}
                    </span>
                    <span
                      className={`text-xl font-extrabold tabular-nums font-mono block ${
                        remainingDue > 0 ? 'text-amber-500' : 'text-primary'
                      }`}
                    >
                      {remainingDue > 0 ? formatCurrency(remainingDue) : formatCurrency(changeDue)}
                    </span>
                  </div>
                </div>

                {/* Status Pill for Exact / Change */}
                <div className="flex items-center justify-between px-1 text-xs">
                  {tenderedAmount === currentTarget && (
                    <span className="inline-flex items-center gap-1 text-primary font-bold">
                      <Check size={14} />
                      {language === 'am' ? 'ትክክለኛ ልክ (ልዩነት የለም)' : 'Exact Amount (No change)'}
                    </span>
                  )}
                  {tenderedAmount > currentTarget && (
                    <span className="inline-flex items-center gap-1 text-primary font-bold">
                      <Check size={14} />
                      {language === 'am' ? `ተመላሽ መልስ፡ ${formatCurrency(changeDue)}` : `Change to return: ${formatCurrency(changeDue)}`}
                    </span>
                  )}
                  {tenderedAmount < currentTarget && (
                    <span className="text-amber-500 font-bold">
                      {language === 'am' ? `የቀረ ክፍያ፡ ${formatCurrency(remainingDue)}` : `Short: ${formatCurrency(remainingDue)}`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Digital Reference Code Entry */
              <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-text-main">
                  <ShieldCheck size={16} className="text-primary flex-shrink-0" />
                  <span>{language === 'am' ? 'የዲጂታል ክፍያ ማረጋገጫ' : 'Digital Payment Verification'}</span>
                </div>
                <Input
                  label={t('referenceCode')}
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  placeholder={language === 'am' ? 'የግብይት ኮድ (አማራጭ)' : 'SMS Transaction Ref (Optional)'}
                  className="font-mono text-sm"
                />
              </div>
            )}

            {/* 4. Split Mode Toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const next = !isSplitMode;
                  setIsSplitMode(next);
                  if (!next) {
                    setSplitPayments([]);
                    setTenderedStr(totalAmount.toFixed(2));
                  }
                }}
                className="text-xs font-bold text-text-muted hover:text-primary flex items-center gap-1.5 cursor-pointer"
              >
                <Split size={14} strokeWidth={2} />
                <span>{isSplitMode ? t('checkout.cancelSplitPayment') : t('checkout.splitPayment')}</span>
              </button>
            </div>

            {/* Split recorded items if active */}
            {isSplitMode && splitPayments.length > 0 && (
              <div className="bg-surface-2 rounded-xl p-2.5 border border-border-subtle flex flex-col gap-1.5 max-h-24 overflow-y-auto">
                {splitPayments.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-1.5 rounded-lg bg-surface text-xs font-semibold text-text-main border border-border-subtle"
                  >
                    <span className="font-bold">{p.method}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{formatCurrency(p.amount)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSplitTender(idx)}
                        className="text-danger hover:opacity-80 p-0.5 cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── 5. PRIMARY COMPLETE SALE BUTTON (ALWAYS VISIBLE WITHOUT SCROLLING!) ─── */}
            <div className="pt-1">
              <Button
                size="lg"
                variant="primary"
                fullWidth
                onClick={handleComplete}
                disabled={!isSufficient || isSubmitting}
                className="h-12 text-[16px] font-bold shadow-soft flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin" />
                    <span>{t('checkout.processingTransaction')}</span>
                  </span>
                ) : (
                  <span>
                    {language === 'am' ? 'ክፈል' : 'Complete Sale'} · {formatCurrency(currentTarget)} (F4)
                  </span>
                )}
              </Button>
            </div>
          </div>

          {/* ─── Right Column (6 cols): Quick Cash & Compact Numeric Keypad ─── */}
          <div className="md:col-span-6 flex flex-col justify-between gap-3 border-t md:border-t-0 md:border-l border-border-subtle pt-3 md:pt-0 md:pl-5">
            {selectedMethod === 'CASH' ? (
              <div className="flex flex-col gap-2.5 h-full justify-between">
                <div>
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                    {language === 'am' ? 'ፈጣን ጥሬ ገንዘብ እና ቁጥሮች' : 'Quick Cash & Keypad'}
                  </span>
                  <NumberPad
                    onDigit={handleDigit}
                    onClear={handleClear}
                    onBackspace={handleBackspace}
                    onQuickAmount={handleAddQuickCash}
                    quickAmounts={[50, 100, 200, 500, 1000]}
                    showDecimal={true}
                    compact={true}
                  />
                </div>

                {isSplitMode && currentTarget > 0 && tenderedAmount > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Plus size={14} />}
                    onClick={handleAddSplitTender}
                    className="w-full mt-1"
                  >
                    {t('checkout.addCashTender', { amount: formatCurrency(Math.min(tenderedAmount, currentTarget)) })}
                  </Button>
                )}
              </div>
            ) : (
              /* Digital Help & Confirmation Info in Right Column */
              <div className="flex flex-col justify-between h-full space-y-4 py-2">
                <div className="p-4 rounded-2xl bg-surface-2 border border-border-subtle space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                    {selectedMethod === 'TELEBIRR' && <Smartphone size={22} />}
                    {selectedMethod === 'CARD' && <CreditCard size={22} />}
                    {selectedMethod === 'BANK_TRANSFER' && <Building size={22} />}
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-text-main">
                      {selectedMethod === 'TELEBIRR' && (language === 'am' ? 'የቴሌብር ክፍያ' : 'telebirr SuperApp')}
                      {selectedMethod === 'CARD' && (language === 'am' ? 'የባንክ ካርድ (POS)' : 'Bank Card Terminal')}
                      {selectedMethod === 'BANK_TRANSFER' && (language === 'am' ? 'የባንክ ማስተላለፍ' : 'Direct Bank Transfer')}
                    </h4>
                    <p className="text-[13px] text-text-muted mt-1 leading-relaxed">
                      {selectedMethod === 'TELEBIRR' && (language === 'am'
                        ? 'ደንበኛው በቴሌብር የከፈለበትን የኤስኤምኤስ (SMS) ደረሰኝ ወይም የግብይት ኮድ ያረጋግጡ።'
                        : "Verify the customer's telebirr payment confirmation SMS or transaction ID.")}
                      {selectedMethod === 'CARD' && (language === 'am'
                        ? 'ካርዱን በPOS ማሽኑ ላይ ካስተላለፉ በኋላ የክፍያውን ደረሰኝ ያረጋግጡ።'
                        : 'Swipe or tap customer card on the payment terminal and verify approval.')}
                      {selectedMethod === 'BANK_TRANSFER' && (language === 'am'
                        ? 'የባንክ ሂሳብ ማስተላለፍ ማረጋገጫ ደረሰኝን ያረጋግጡ።'
                        : 'Confirm the bank transfer slip or mobile banking confirmation.')}
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-primary-soft/50 border border-primary/20 text-xs font-medium text-text-main flex items-center gap-2">
                  <ShieldCheck size={18} className="text-primary flex-shrink-0" />
                  <span>
                    {language === 'am'
                      ? 'የኢንተርኔት መቆራረጥ በሚኖርበት ጊዜም ክፍያው በደህንነት ይመዘገባል።'
                      : 'Transaction recorded securely even during local network internet outages.'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedMethod('CASH')}
                  className="w-full py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold transition cursor-pointer"
                >
                  &larr; {language === 'am' ? 'ወደ ጥሬ ገንዘብ ተመለስ' : 'Switch back to Cash'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
