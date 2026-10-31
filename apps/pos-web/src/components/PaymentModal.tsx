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
  const { t, formatCurrency } = useI18n();
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
        /* Payment Selection & Tender Entry */
        <div className="flex flex-col gap-4">
          {/* Top Amount Due Header */}
          <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between shadow-soft">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
                {t('amountDue')}
              </span>
              {isSplitMode && (
                <span className="text-xs text-primary font-semibold">
                  Split Paid: {formatCurrency(recordedSplitTotal)} / Total: {formatCurrency(totalAmount)}
                </span>
              )}
            </div>
            <span className="text-3xl font-bold text-text-main tabular-nums font-mono">
              {formatCurrency(currentTarget)}
            </span>
          </div>

          {/* Payment Method Selectors */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
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

          {/* Split Payment Toggle & Active Splits */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
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
                className="text-xs font-medium text-text-muted hover:text-primary flex items-center gap-1.5 cursor-pointer"
              >
                <Split size={14} strokeWidth={1.75} />
                <span>{isSplitMode ? 'Cancel Split Payment' : t('splitPayment')}</span>
              </button>
            </div>

            {isSplitMode && splitPayments.length > 0 && (
              <div className="bg-surface-2 rounded-xl p-3 border border-border-subtle flex flex-col gap-2">
                <span className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Recorded Tenders ({splitPayments.length})
                </span>
                <div className="flex flex-col gap-1.5 max-h-28 overflow-y-auto">
                  {splitPayments.map((p, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface text-xs font-semibold text-text-main border border-border-subtle"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-surface-2 text-text-muted">
                          {p.method}
                        </span>
                        {p.reference && <span className="font-mono text-text-muted">Ref: {p.reference}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono tabular-nums">{formatCurrency(p.amount)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitTender(idx)}
                          className="text-danger hover:opacity-80 p-1 cursor-pointer"
                          aria-label="Remove split"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tender Entry: Cash Keypad or Reference Input */}
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
                      className="px-2.5 py-1 rounded-md text-xs font-bold bg-primary-soft text-primary hover:bg-primary-soft/80 cursor-pointer transition-colors"
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
                      remainingDue > 0 ? 'text-warning' : 'text-primary'
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

              {isSplitMode && currentTarget > 0 && tenderedAmount > 0 && (
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Plus size={16} />}
                  onClick={handleAddSplitTender}
                >
                  Add Cash Tender ({formatCurrency(Math.min(tenderedAmount, currentTarget))})
                </Button>
              )}
            </div>
          ) : (
            /* Digital Payments (Telebirr / CBE Birr / Bank Transfer / Card) */
            <div className="flex flex-col gap-3 py-2">
              <div className="p-4 rounded-xl bg-info-soft/40 border border-info/20 flex items-center gap-3">
                <ShieldCheck size={24} strokeWidth={1.75} className="text-info flex-shrink-0" />
                <div className="text-[13px] text-text-muted">
                  <span className="font-semibold block text-text-main mb-0.5">Offline-Ready Verification</span>
                  Enter SMS confirmation code or payment transaction reference.
                </div>
              </div>

              <Input
                label={t('referenceCode')}
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                placeholder={t('referenceOptional')}
                className="font-mono text-base"
              />

              {isSplitMode && currentTarget > 0 && (
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Plus size={16} />}
                  onClick={handleAddSplitTender}
                >
                  Add {selectedMethod} Tender ({formatCurrency(currentTarget)})
                </Button>
              )}
            </div>
          )}

          {/* Complete Sale Action Button */}
          <Button
            size="lg"
            variant="primary"
            fullWidth
            onClick={handleComplete}
            disabled={!isSufficient || isSubmitting}
            className="mt-1"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span>Processing Transaction...</span>
              </span>
            ) : (
              <span>
                {t('completeSale')} · {formatCurrency(currentTarget)}
              </span>
            )}
          </Button>
        </div>
      )}
    </Modal>
  );
};
