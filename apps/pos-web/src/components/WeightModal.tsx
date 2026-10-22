import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import { Modal } from './ui/Modal';
import { NumberPad } from './ui/NumberPad';
import { Button } from './ui/Button';
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

  if (!product) return null;

  const productName = language === 'am' && product.nameAm ? product.nameAm : product.nameEn;
  const weightKg = parseFloat(weightStr) || 0;
  const calculatedPrice = weightKg * product.price;

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
        {/* Weight & Price Live Display */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gebeya-100 dark:bg-gebeya-950/60 text-gebeya-600 dark:text-gebeya-400 flex items-center justify-center">
              <Scale size={24} />
            </div>
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                {t('weighedItemPrompt')}
              </span>
              <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {weightStr} <span className="text-lg font-medium text-slate-400">{t('weighedUnitKg')}</span>
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              {t('total')}
            </span>
            <span className="text-2xl font-black text-gebeya-600 dark:text-gebeya-400">
              {formatCurrency(calculatedPrice)}
            </span>
          </div>
        </div>

        {/* Quick weight presets */}
        <div className="grid grid-cols-4 gap-2">
          {[0.25, 0.5, 1.0, 2.0].map((kg) => (
            <button
              key={kg}
              type="button"
              onClick={() => handlePreset(kg)}
              className="min-h-[44px] rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 active:scale-95 transition-all"
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

        {/* Confirm Action Button */}
        <Button
          size="lg"
          variant="primary"
          fullWidth
          onClick={handleSave}
          disabled={weightKg <= 0}
        >
          {t('confirmWeight')} ({formatCurrency(calculatedPrice)})
        </Button>
      </div>
    </Modal>
  );
};
