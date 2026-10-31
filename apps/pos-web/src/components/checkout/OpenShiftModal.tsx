import React, { useState } from 'react';
import { LockKeyhole, Banknote, Sparkles } from 'lucide-react';
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
  const { t, formatCurrency } = useI18n();
  const [floatStr, setFloatStr] = useState<string>('1000');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = [500, 1000, 2000, 5000];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const amount = parseFloat(floatStr);
    if (isNaN(amount) || amount < 0) {
      setErrorMsg('Please enter a valid non-negative float amount');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      await onOpenShift(amount, notes || undefined);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to open shift');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}} // Cannot close without opening a shift
      title={t('openShiftRequiredTitle')}
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
              {t('openShiftRequiredDesc')}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-danger-soft text-danger text-sm font-medium">
            {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-text-main mb-2">
            {t('openingCashFloatLabel')}
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-mono font-medium">
              ETB
            </span>
            <input
              type="number"
              step="any"
              min="0"
              value={floatStr}
              onChange={(e) => setFloatStr(e.target.value)}
              className="w-full pl-14 pr-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
              placeholder={t('openingCashFloatPlaceholder')}
              autoFocus
            />
          </div>

          {/* Quick Preset Chips */}
          <div className="flex items-center gap-2 mt-3">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setFloatStr(preset.toString())}
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
            Shift Notes (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-text-main text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
            placeholder="e.g., Morning opening register"
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
            {isSubmitting ? 'Opening Shift...' : t('openShiftAction')}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
