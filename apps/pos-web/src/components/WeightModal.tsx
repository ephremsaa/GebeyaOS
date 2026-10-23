import React, { useState, useEffect } from 'react';
import { Scale } from 'lucide-react';
import { Modal, NumberPad, Button } from './ui';
import { useI18n } from '../i18n/I18nContext';
import { SampleProduct } from '../sample-data';

export interface WeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: SampleProduct | null;
  onConfirm: (product: SampleProduct, weightKg: number) => void;
}

export const WeightModal: React.FC<WeightModalProps> = ({
  isOpen,
  onClose,
  product,
  onConfirm,
}) => {
  const { language, t, formatCurrency } = useI18n();
  const [weightStr, setWeightStr] = useState<string>('1.000');

  useEffect(() => {
    if (isOpen) {
      setWeightStr('1.000');
    }
  }, [isOpen, product]);

  if (!product) return null;

  const productName = language === 'am' && product.nameAm ? product.nameAm : product.nameEn;
  const weightKg = parseFloat(weightStr) || 0;
  const calculatedPrice = Number((weightKg * product.price).toFixed(2));

  const handleDigit = (digit: string) => {
    if (digit === '.' && weightStr.includes('.')) return;
    if (weightStr === '0' && digit !== '.') {
      setWeightStr(digit);
    } else {
      setWeightStr((prev) => prev + digit);
    }
  };

  const handleClear = () => {
    setWeightStr('0');
  };

  const handleBackspace = () => {
    setWeightStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handlePreset = (kg: number) => {
    setWeightStr(kg.toFixed(3));
  };

  const handleSave = () => {
    if (weightKg <= 0) return;
    onConfirm(product, weightKg);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={productName}
      subtitle={`${formatCurrency(product.price)} / ${t('weighedUnitKg')}`}
      maxWidth="md"
    >
      <div className="flex flex-col gap-4">
        {/* Big Weight Display & Live Total Banner */}
        <div className="p-4 rounded-xl bg-elevated border border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Scale size={24} />
            </div>
            <div>
              <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                {t('weighedItemPrompt')}
              </span>
              <span className="text-3xl font-black text-text-main tabular-nums">
                {weightStr} <span className="text-base font-semibold text-text-muted">{t('weighedUnitKg')}</span>
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
              {t('weighedItemTotal')}
            </span>
            <span className="text-2xl font-black text-primary tabular-nums font-mono">
              {formatCurrency(calculatedPrice)}
            </span>
          </div>
        </div>

        {/* Quick Weight Presets */}
        <div className="grid grid-cols-4 gap-2">
          {[0.25, 0.5, 1.0, 2.0].map((kg) => (
            <button
              key={kg}
              type="button"
              onClick={() => handlePreset(kg)}
              className="min-h-[44px] rounded-lg font-bold text-xs bg-surface hover:bg-elevated text-text-main border border-border-strong active:scale-95 transition-all cursor-pointer"
            >
              {kg} {t('weighedUnitKg')}
            </button>
          ))}
        </div>

        {/* Numberpad */}
        <NumberPad
          onDigit={handleDigit}
          onClear={handleClear}
          onBackspace={handleBackspace}
          showDecimal={true}
        />

        {/* Actions: Cancel & Add */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <Button
            size="lg"
            variant="secondary"
            onClick={onClose}
          >
            {t('cancel')}
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={handleSave}
            disabled={weightKg <= 0}
          >
            {t('confirmWeight')} ({formatCurrency(calculatedPrice)})
          </Button>
        </div>
      </div>
    </Modal>
  );
};
