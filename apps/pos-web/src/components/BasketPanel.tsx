import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  PlayCircle,
  Percent,
  RotateCcw,
  AlertCircle,
  Scale,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { CartItem } from './PosCheckout';

export interface BasketPanelProps {
  cart: CartItem[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onClearBasket: () => void;
  onHoldBasket: () => void;
  onResumeBasket: () => void;
  hasHeldBasket: boolean;
  onOpenPayment: () => void;
  onApplyDiscount?: (discountPercent: number) => void;
}

export const BasketPanel: React.FC<BasketPanelProps> = ({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearBasket,
  onHoldBasket,
  onResumeBasket,
  hasHeldBasket,
  onOpenPayment,
}) => {
  const { language, t, formatCurrency } = useI18n();
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.lineTotal, 0);
  // Ethiopian 15% VAT for VAT-inclusive retail calculation: tax = price * 15 / 115
  const vatTotal = cart.reduce((sum, item) => {
    return item.isVat ? sum + item.lineTotal * (15 / 115) : sum;
  }, 0);
  const total = subtotal;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleConfirmClear = () => {
    setIsClearModalOpen(false);
    onClearBasket();
  };

  return (
    <aside className="w-96 lg:w-[420px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full flex-shrink-0 select-none">
      {/* Basket Header */}
      <div className="h-14 px-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t('basketTitle')}
          </h2>
          {cart.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gebeya-100 dark:bg-gebeya-950 text-gebeya-700 dark:text-gebeya-300">
              {cart.length} {cart.length === 1 ? t('item') : t('items')}
            </span>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center gap-1">
          {hasHeldBasket && (
            <button
              onClick={onResumeBasket}
              className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
              title={t('resume')}
            >
              <PlayCircle size={18} />
            </button>
          )}

          {cart.length > 0 && (
            <>
              <button
                onClick={onHoldBasket}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={t('hold')}
              >
                <PauseCircle size={18} />
              </button>
              <button
                onClick={() => setIsClearModalOpen(true)}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                title={t('clearBasket')}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Line Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
        {cart.length === 0 ? (
          <EmptyState
            title={t('basketEmptyTitle')}
            subtitle={t('basketEmptySubtitle')}
          />
        ) : (
          cart.map((item, index) => {
            const productName = language === 'am' && item.product.nameAm ? item.product.nameAm : item.product.nameEn;
            const isScale = !!item.scaleWeightGrams;

            return (
              <div
                key={`${item.product.id}-${index}`}
                className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors group"
              >
                {/* Item Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isScale && <Scale size={13} className="text-gebeya-600 flex-shrink-0" />}
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {productName}
                    </h4>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {isScale ? (
                      <span>
                        {(item.scaleWeightGrams! / 1000).toFixed(3)} kg × {formatCurrency(item.unitPrice)}
                      </span>
                    ) : (
                      <span>{formatCurrency(item.unitPrice)}</span>
                    )}
                  </div>
                </div>

                {/* Quantity Controls (Large 44px+ touch targets with editable input) */}
                <div className="flex items-center gap-2">
                  {!isScale ? (
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 border border-slate-200/80 dark:border-slate-700">
                      <button
                        onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 1) {
                            onUpdateQuantity(index, val);
                          }
                        }}
                        className="w-12 h-10 text-center font-bold text-base bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-700 rounded-md"
                        aria-label="Quantity"
                      />
                      <button
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 active:scale-95 transition-all"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {(item.scaleWeightGrams! / 1000).toFixed(3)} kg
                    </span>
                  )}

                  {/* Line Total */}
                  <div className="w-24 text-right">
                    <span className="text-base font-bold text-slate-900 dark:text-white font-mono block">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {/* Quick Delete */}
                  <button
                    onClick={() => onRemoveItem(index)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    aria-label="Remove item"
                    title={t('clearBasket')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary & Big Pay Button */}
      <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/90 flex flex-col gap-3">
        {/* Subtotal & VAT (Consistent & right-aligned) */}
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
            <span>{t('subtotal')}</span>
            <span className="font-mono font-medium text-slate-700 dark:text-slate-300 text-right">
              {formatCurrency(subtotal)}
            </span>
          </div>

          <div className="flex justify-between items-center text-slate-400 dark:text-slate-500 text-xs">
            <span>VAT 15% (included)</span>
            <span className="font-mono font-medium text-right">
              {formatCurrency(vatTotal)}
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-800 my-0.5" />

          {/* Grand Total - Large and Bold */}
          <div className="flex justify-between items-baseline pt-1">
            <span className="text-base font-extrabold text-slate-900 dark:text-white">
              {t('total')}
            </span>
            <span className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight text-right">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* Large Always-Visible Pay Button with subtle F4 hint */}
        <Button
          size="xl"
          variant="primary"
          fullWidth
          disabled={cart.length === 0}
          onClick={onOpenPayment}
          className="min-h-[58px] shadow-lg shadow-gebeya-600/20 flex items-center justify-between px-6"
        >
          <span className="text-xl font-bold">{t('payButton')}</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-2xl font-black">{formatCurrency(total)}</span>
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-white/20 text-white rounded-md">
              F4
            </kbd>
          </div>
        </Button>
      </div>

      {/* Clear Confirmation Dialog */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={t('clearBasketConfirmTitle')}
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-red-600">
            <AlertCircle size={28} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t('clearBasketConfirmMsg')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Button
              variant="outline"
              onClick={() => setIsClearModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmClear}
            >
              {t('confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  );
};
