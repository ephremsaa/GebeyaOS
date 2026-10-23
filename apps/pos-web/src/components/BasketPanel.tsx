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
    <aside className="w-88 lg:w-96 xl:w-[420px] bg-surface border-l border-border-subtle flex flex-col h-full flex-shrink-0 select-none">
      {/* 1. Header: Current basket (n) with Hold and Clear icon buttons */}
      <div className="h-14 px-4 sm:px-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface/80">
        <div className="flex items-center gap-2">
          <h2 className="text-sm sm:text-base font-bold text-text-main leading-none">
            {basketHeaderTitle}
          </h2>
        </div>

        {/* Secondary Actions with Tooltips */}
        <div className="flex items-center gap-1">
          {hasHeldBasket && (
            <button
              type="button"
              onClick={onResumeBasket}
              className="p-2 rounded-lg text-warning hover:bg-warning/10 transition-colors cursor-pointer"
              title={t('resume')}
              aria-label={t('resume')}
            >
              <PlayCircle size={18} />
            </button>
          )}

          {!isCartEmpty && (
            <>
              <button
                type="button"
                onClick={onHoldBasket}
                className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-elevated transition-colors cursor-pointer"
                title={t('hold')}
                aria-label={t('hold')}
              >
                <PauseCircle size={18} />
              </button>
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="p-2 rounded-lg text-text-dim hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                title={t('clearBasket')}
                aria-label={t('clearBasket')}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Line Items List (Scrollable) */}
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
                className="p-3.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 hover:bg-elevated/40 transition-colors"
              >
                {/* Item Details */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    {isScale && <Scale size={13} className="text-primary flex-shrink-0" />}
                    <h4 className="text-xs sm:text-sm font-bold text-text-main truncate">
                      {productName}
                    </h4>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 tabular-nums">
                    {isScale ? (
                      <span>
                        {(item.scaleWeightGrams! / 1000).toFixed(3)} kg × {formatCurrency(item.unitPrice)}
                      </span>
                    ) : (
                      <span>{formatCurrency(item.unitPrice)}</span>
                    )}
                  </div>
                </div>

                {/* Quantity Controls (Stepper with 44px buttons and editable input) */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {!isScale ? (
                    <div className="flex items-center bg-elevated rounded-lg p-0.5 border border-border-strong">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-md flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={15} />
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
                        className="w-10 h-10 text-center font-bold text-sm tabular-nums bg-transparent text-text-main focus:outline-none focus:bg-surface rounded"
                        aria-label="Item quantity"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-md flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus size={15} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold px-2 py-1.5 rounded-lg bg-elevated text-text-main border border-border-subtle tabular-nums">
                      {(item.scaleWeightGrams! / 1000).toFixed(3)} kg
                    </span>
                  )}

                  {/* Line Total */}
                  <div className="w-20 sm:w-24 text-right">
                    <span className="text-sm sm:text-base font-bold text-text-main tabular-nums font-mono block">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {/* Item Remove Button */}
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-text-dim hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                    aria-label="Remove item"
                    title={t('clearBasket')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Totals Pinned at the Bottom + Single-line Pay Button */}
      <div className="p-4 sm:p-5 border-t border-border-subtle bg-surface/90 flex flex-col gap-3">
        {/* Subtotal & VAT (Right-aligned, VAT hidden when zero) */}
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between items-center text-text-muted text-xs sm:text-sm">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums font-mono font-medium text-text-main text-right">
              {formatCurrency(subtotal)}
            </span>
          </div>

          {/* Hide the VAT row when zero */}
          {vatTotal > 0 && (
            <div className="flex justify-between items-center text-text-dim text-xs">
              <span>{t('vatIncludedNotice')}</span>
              <span className="tabular-nums font-mono font-medium text-right">
                {formatCurrency(vatTotal)}
              </span>
            </div>
          )}

          <div className="h-px bg-border-subtle my-1" />

          {/* Total: Large and bold, right-aligned */}
          <div className="flex justify-between items-baseline pt-0.5">
            <span className="text-sm sm:text-base font-extrabold text-text-main">
              {t('total')}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-text-main font-mono tabular-nums tracking-tight text-right">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        {/* 4. Single-line Pay Button: "Pay · 110.00 ETB" with F4 badge on right */}
        <button
          type="button"
          disabled={isCartEmpty}
          onClick={onOpenPayment}
          className={`w-full min-h-[56px] px-5 rounded-xl font-bold flex items-center justify-between transition-all duration-150 select-none active:scale-[0.99] cursor-pointer ${
            isCartEmpty
              ? 'bg-elevated text-text-dim border border-border-subtle cursor-not-allowed pointer-events-none'
              : 'bg-primary hover:bg-primary-hover text-white shadow-md shadow-primary/25'
          }`}
          aria-label="Proceed to payment"
        >
          {/* One-line: Pay · 110.00 ETB */}
          <span className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums">
            {t('payActionPrefix')} {formatCurrency(total)}
          </span>

          {/* F4 Keyboard Badge */}
          <KeyboardHint
            shortcut="F4"
            className={isCartEmpty ? 'opacity-40' : 'bg-white/20 text-white border-white/30'}
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
            <AlertTriangle size={24} className="flex-shrink-0" />
            <p className="text-xs sm:text-sm text-text-muted leading-relaxed">
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
