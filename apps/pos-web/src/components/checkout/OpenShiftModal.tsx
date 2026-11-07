import React, { useState } from 'react';
import { LockKeyhole, Banknote, Sparkles, AlertTriangle } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { Modal, Button, Input } from '../ui';

export interface OpenShiftModalProps {
  isOpen: boolean;
  onOpenShift: (openingCashFloat: number, notes?: string) => Promise<void>;
  cashierName: string;
  terminalCode: string;
}

export const OpenShiftModal: React.FC<OpenShiftModalProps> = ({
  isOpen,
  onOpenShift,
  cashierName,
  terminalCode,
}) => {
  const { t, formatCurrency, language } = useI18n();
  const [floatStr, setFloatStr] = useState<string>('1000');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showZeroConfirmation, setShowZeroConfirmation] = useState(false);

  const presets = [500, 1000, 2000, 5000];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amount = parseFloat(floatStr);
    if (isNaN(amount) || amount < 0) {
      setErrorMsg(language === 'am' ? 'እባክዎ ትክክለኛ ያልተቀነሰ የመነሻ ገንዘብ ያስገቡ' : 'Please enter a valid non-negative float amount');
      return;
    }

    if (amount === 0 && !showZeroConfirmation) {
      setShowZeroConfirmation(true);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onOpenShift(amount, notes || undefined);
      setShowZeroConfirmation(false);
    } catch (err: any) {
      setErrorMsg(err.message || (language === 'am' ? 'ፈረቃ መክፈት አልተቻለም' : 'Failed to open shift'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Cannot close without opening a shift
      title={t('shift.openShiftRequiredTitle')}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-2">
        <div className="flex items-start gap-4 p-4 rounded-xl bg-primary-soft/40 border border-primary/20">
          <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0">
            <LockKeyhole size={20} strokeWidth={2} />
          </div>
          <div>
            <h4 className="font-semibold text-text-main text-[15px]">
              {terminalCode} · {cashierName}
            </h4>
            <p className="text-sm text-text-muted mt-0.5 leading-relaxed">
              {t('shift.openShiftRequiredDesc')}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-danger-soft text-danger text-sm font-medium">
            {errorMsg}
          </div>
        )}

        {/* Explicit confirmation warning for 0.00 float */}
        {showZeroConfirmation && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col gap-2">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{t('shift.confirmZeroFloatTitle')}</span>
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              {t('shift.confirmZeroFloatDesc')}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setShowZeroConfirmation(false)}
                className="px-3 py-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-semibold text-text-muted hover:text-text-main cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer shadow-soft"
              >
                {t('shift.confirmZeroFloatAction')}
              </button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-text-main mb-2">
            {t('shift.openingCashFloatLabel')}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-mono font-medium">
              {t('common.currencySymbol')}
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={floatStr}
              onChange={(e) => {
                setFloatStr(e.target.value);
                setShowZeroConfirmation(false);
              }}
              className="w-full pl-14 pr-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
              placeholder={t('shift.openingCashFloatPlaceholder')}
              autoFocus
            />
          </div>

          {/* Quick Preset Chips */}
          <div className="flex items-center gap-2 mt-3">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setFloatStr(preset.toString());
                  setShowZeroConfirmation(false);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all duration-fast cursor-pointer ${
                  parseFloat(floatStr) === preset
                    ? 'bg-primary text-white border-primary shadow-soft'
                    : 'bg-surface-2 text-text-main border-border-subtle hover:border-border-strong'
                }`}
              >
                {formatCurrency(preset)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-text-main mb-2">
            {t('common.notes')} ({t('common.optional')})
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
            placeholder={language === 'am' ? 'ለምሳሌ፡ የጥዋት መክፈቻ ካዝና' : 'e.g., Morning register float'}
          />
        </div>

        <div className="mt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full justify-center min-h-[50px] text-base font-semibold"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? language === 'am'
                ? 'ፈረቃ በመክፈት ላይ...'
                : 'Opening Shift...'
              : t('shift.openShiftAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
