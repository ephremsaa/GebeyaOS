import React, { useState } from 'react';
import { Tag, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { Modal, Button } from '../ui';
import { posApi } from '../../utils/pos-api';

export interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  grossAmount: number;
  userRole: string;
  branchId: string;
  onApplyDiscount: (discountAmount: number, reason: string, authorizedBy?: string) => void;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({
  isOpen,
  onClose,
  title,
  grossAmount,
  userRole,
  branchId,
  onApplyDiscount,
}) => {
  const { t, formatCurrency } = useI18n();
  const [mode, setMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [valueStr, setValueStr] = useState<string>('5');
  const [reason, setReason] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Cashier role threshold is max 5%
  const maxUnattendedPercent = userRole === 'CASHIER' ? 5 : userRole === 'BRANCH_MANAGER' ? 25 : 100;

  const numericValue = parseFloat(valueStr) || 0;
  const computedDiscountAmount =
    mode === 'PERCENT'
      ? Math.min(grossAmount, (grossAmount * numericValue) / 100)
      : Math.min(grossAmount, numericValue);

  const effectivePercent = grossAmount > 0 ? (computedDiscountAmount / grossAmount) * 100 : 0;
  const requiresManagerPin = effectivePercent > maxUnattendedPercent;

  const handleApply = async () => {
    if (computedDiscountAmount <= 0) {
      onClose();
      return;
    }

    if (requiresManagerPin) {
      if (!managerPin.trim()) {
        setAuthError(t('checkout.managerPinRequiredDiscount'));
        return;
      }

      try {
        setIsVerifying(true);
        setAuthError(null);
        const res = await posApi.verifyManagerPin(branchId, {
          pin: managerPin.trim(),
          actionRequired: 'DISCOUNT_OVERRIDE',
        });

        if (!res.authorized) {
          setAuthError(res.message || t('checkout.invalidManagerPin'));
          return;
        }

        onApplyDiscount(computedDiscountAmount, reason, res.authorizedBy);
        onClose();
      } catch (err: any) {
        setAuthError(err.message || t('checkout.verificationFailed'));
      } finally {
        setIsVerifying(false);
      }
    } else {
      onApplyDiscount(computedDiscountAmount, reason);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="md">
      <div className="flex flex-col gap-4 py-1">
        {/* Mode Selector */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface-2 border border-border-subtle">
          <button
            type="button"
            onClick={() => setMode('PERCENT')}
            className={`py-2 text-sm font-semibold rounded-lg transition-all duration-fast cursor-pointer ${
              mode === 'PERCENT'
                ? 'bg-surface text-text-main shadow-soft'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('percent')}
          </button>
          <button
            type="button"
            onClick={() => setMode('FIXED')}
            className={`py-2 text-sm font-semibold rounded-lg transition-all duration-fast cursor-pointer ${
              mode === 'FIXED'
                ? 'bg-surface text-text-main shadow-soft'
                : 'text-text-muted hover:text-text-main'
            }`}
          >
            {t('fixedAmount')}
          </button>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-semibold text-text-main mb-1.5">
            {mode === 'PERCENT' ? t('checkout.discountPercentage') : t('checkout.discountAmount')}
          </label>
          <div className="relative">
            <input
              type="number"
              step="any"
              min="0"
              max={mode === 'PERCENT' ? 100 : grossAmount}
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
              placeholder="0"
              autoFocus
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted font-mono font-medium">
              {mode === 'PERCENT' ? '%' : t('common.currencySymbol')}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs text-text-muted mt-2">
            <span>
              {t('checkout.calculatedDiscount')}: <strong className="text-text-main font-mono">{formatCurrency(computedDiscountAmount)}</strong>
            </span>
            <span>
              {t('checkout.netTotal')}: <strong className="text-text-main font-mono">{formatCurrency(grossAmount - computedDiscountAmount)}</strong>
            </span>
          </div>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-semibold text-text-main mb-1.5">
            {t('discountReason')}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
            placeholder={t('checkout.discountPlaceholder')}
          />
        </div>

        {/* Manager PIN Override Notice & Input */}
        {requiresManagerPin && (
          <div className="p-4 rounded-xl bg-warning-soft/40 border border-warning/30 flex flex-col gap-3 animate-in fade-in duration-200">
            <div className="flex items-start gap-3">
              <ShieldAlert size={20} strokeWidth={2} className="text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h5 className="text-sm font-semibold text-text-main">
                  {t('managerPinRequiredTitle')}
                </h5>
                <p className="text-xs text-text-muted mt-0.5">
                  {t('checkout.supervisorPinNotice', { limit: maxUnattendedPercent, current: effectivePercent.toFixed(1) })}
                </p>
              </div>
            </div>

            <input
              type="password"
              maxLength={8}
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-center tracking-widest text-lg font-bold focus:outline-none focus:ring-2 focus:ring-warning/30 focus:border-warning transition-all duration-fast"
              placeholder={t('managerPinPlaceholder')}
            />

            {authError && (
              <p className="text-xs font-semibold text-danger">{authError}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleApply}
            disabled={isVerifying || computedDiscountAmount <= 0}
          >
            {isVerifying ? t('checkout.verifying') : t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
