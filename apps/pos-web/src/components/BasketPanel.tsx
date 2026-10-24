import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  PlayCircle,
  Scale,
  AlertTriangle,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState, Button, Modal, KeyboardHint } from './ui';
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

  const isCartEmpty = cart.length === 0;
  const basketHeaderTitle = `${t('currentBasketHeader')} (${itemCount})`;

  return (
    <aside className="w-[380px] min-w-[380px] bg-surface border-l border-border-subtle flex flex-col h-full flex-shrink-0 select-none">
      {/* 1. Header: Current basket (n) with Hold and Clear icon buttons */}
      <div className="h-14 px-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface">
        <h2 className="text-base font-semibold text-text-main leading-none">
          {basketHeaderTitle}
        </h2>

        {/* Secondary Actions with Tooltips */}
        <div className="flex items-center gap-1">
          {hasHeldBasket && (
            <button
              type="button"
              onClick={onResumeBasket}
              className="p-2 rounded-lg text-warning hover:bg-warning-soft transition-colors duration-fast cursor-pointer"
              title={t('resume')}
              aria-label={t('resume')}
            >
              <PlayCircle size={18} strokeWidth={1.75} />
            </button>
          )}

          {!isCartEmpty && (
            <>
              <button
                type="button"
                onClick={onHoldBasket}
                className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors duration-fast cursor-pointer"
                title={t('hold')}
                aria-label={t('hold')}
              >
                <PauseCircle size={18} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="p-2 rounded-lg text-text-dim hover:text-danger hover:bg-danger-soft transition-colors duration-fast cursor-pointer"
                title={t('clearBasket')}
                aria-label={t('clearBasket')}
              >
                <Trash2 size={18} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Scrollable Line Items */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
        {isCartEmpty ? (
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
                className="p-4 flex items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors duration-fast"
              >
                {/* Item Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    {isScale && <Scale size={14} strokeWidth={1.75} className="text-primary flex-shrink-0" />}
                    <h4 className="text-[14px] font-semibold text-text-main truncate">
                      {productName}
                    </h4>
                  </div>
                  <div className="text-[13px] text-text-muted mt-0.5 tabular-nums">
                    {isScale ? (
                      <span>
                        {(item.scaleWeightGrams! / 1000).toFixed(3)} kg × {formatCurrency(item.unitPrice)}
                      </span>
                    ) : (
                      <span>{formatCurrency(item.unitPrice)}</span>
                    )}
                  </div>
                </div>

                {/* 44px Stepper with Editable Quantity */}
                <div className="flex items-center gap-2">
                  {!isScale ? (
                    <div className="flex items-center bg-surface-2 rounded-xl p-0.5 border border-border-subtle">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all duration-fast cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} strokeWidth={1.75} />
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
                        className="w-11 h-11 text-center font-semibold text-[14px] tabular-nums bg-transparent text-text-main focus:outline-none focus:bg-surface rounded-md"
                        aria-label="Item quantity"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all duration-fast cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[13px] font-semibold px-2.5 py-1.5 rounded-lg bg-surface-2 text-text-main border border-border-subtle tabular-nums">
                      {(item.scaleWeightGrams! / 1000).toFixed(3)} kg
                    </span>
                  )}

                  {/* Line Total (Right-aligned) */}
                  <div className="w-20 text-right">
                    <span className="text-[15px] font-semibold text-text-main tabular-nums font-mono block">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {/* Remove Icon */}
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-text-dim hover:text-danger hover:bg-danger-soft transition-colors duration-fast cursor-pointer"
                    aria-label="Remove item"
                    title={t('clearBasket')}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Pinned Footer: Subtotal, VAT 15% (included) in muted 14px, divider, Total 32px/700, Pay button 56px */}
      <div className="p-5 border-t border-border-subtle bg-surface flex flex-col gap-3">
        {/* Subtotal and VAT in muted 14px */}
        <div className="flex flex-col gap-1.5 text-[14px]">
          <div className="flex justify-between items-center text-text-muted">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums font-mono font-medium text-text-main text-right">
              {formatCurrency(subtotal)}
            </span>
          </div>

          {/* Hide VAT row when zero */}
          {vatTotal > 0 && (
            <div className="flex justify-between items-center text-text-muted text-[14px]">
              <span>{t('vatIncludedNotice')}</span>
              <span className="tabular-nums font-mono font-medium text-right">
                {formatCurrency(vatTotal)}
              </span>
            </div>
          )}

          <div className="h-px bg-border-subtle my-1" />

          {/* Total: 32px/700 */}
          <div className="flex justify-between items-baseline pt-0.5">
            <span className="text-base font-bold text-text-main">
              {t('total')}
            </span>
            <span className="text-[32px] font-bold text-text-main font-mono tabular-nums tracking-tight text-right leading-none">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* 4. Pay Button 56px: "Pay · 110.00 ETB" with F4 hint on the right */}
        <button
          type="button"
          disabled={isCartEmpty}
          onClick={onOpenPayment}
          className={`w-full min-h-[56px] px-5 rounded-xl font-semibold flex items-center justify-between transition-all duration-fast select-none active:scale-[0.98] cursor-pointer ${
            isCartEmpty
              ? 'bg-surface-2 text-text-muted border border-border-subtle cursor-not-allowed pointer-events-none'
              : 'bg-primary hover:bg-primary-hover text-white shadow-soft'
          }`}
          aria-label="Proceed to payment"
        >
          <span className="text-[17px] font-bold tracking-tight tabular-nums">
            {t('payActionPrefix')} {formatCurrency(total)}
          </span>

          <KeyboardHint
            shortcut="F4"
            className={isCartEmpty ? 'opacity-40' : 'bg-white/20 text-white border-white/25'}
          />
        </button>
      </div>

      {/* Clear Confirmation Modal */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={t('clearBasketConfirmTitle')}
        maxWidth="sm"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-warning">
            <AlertTriangle size={24} strokeWidth={1.75} className="flex-shrink-0" />
            <p className="text-[14px] text-text-muted leading-relaxed">
              {t('clearBasketConfirmMsg')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Button
              variant="secondary"
              onClick={() => setIsClearModalOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="danger"
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
