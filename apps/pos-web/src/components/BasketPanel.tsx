import React, { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  PlayCircle,
  Scale,
  AlertTriangle,
  Tag,
  RotateCcw,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState, Button, Modal, KeyboardHint } from './ui';
import { CartItem } from './PosCheckout';
import { round2, calculateTaxInclusiveLineVat } from '@gebeyaos/shared-types';

export interface BasketPanelProps {
  cart: CartItem[];
  onUpdateQuantity: (index: number, newQty: number) => void;
  onRemoveItem: (index: number) => void;
  onClearBasket: () => void;
  onHoldBasket: () => void;
  onResumeBasket: () => void;
  hasHeldBasket: boolean;
  heldBasketsCount?: number;
  onOpenHeldBaskets?: () => void;
  onOpenPayment: () => void;
  onOpenLineDiscount?: (index: number) => void;
  onOpenBasketDiscount?: () => void;
  onOpenRefund?: () => void;
  basketDiscount?: {
    type: 'PERCENT' | 'FIXED';
    value: number;
    amount: number;
    authorizedBy?: string;
  } | null;
}

export const BasketPanel: React.FC<BasketPanelProps> = ({
  cart,
  onUpdateQuantity,
  onRemoveItem,
  onClearBasket,
  onHoldBasket,
  onResumeBasket,
  hasHeldBasket,
  heldBasketsCount = 0,
  onOpenHeldBaskets,
  onOpenPayment,
  onOpenLineDiscount,
  onOpenBasketDiscount,
  onOpenRefund,
  basketDiscount,
}) => {
  const { language, t, formatCurrency } = useI18n();
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Calculations
  const grossSubtotal = round2(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const lineDiscountsTotal = round2(cart.reduce((sum, item) => sum + (item.discount || 0), 0));
  const subtotalAfterLineDiscounts = round2(grossSubtotal - lineDiscountsTotal);
  const basketDiscountAmt = round2(basketDiscount ? basketDiscount.amount : 0);
  const total = Math.max(0, round2(subtotalAfterLineDiscounts - basketDiscountAmt));
  const totalDiscounts = round2(lineDiscountsTotal + basketDiscountAmt);

  // Ethiopian 15% VAT for VAT-inclusive retail calculation:
  // VAT is computed per line using net line amount (accounting for proportional basket discount)
  const vatTotal = round2(
    cart.reduce((sum, item) => {
      if (!item.isVat) return sum;
      const proportion = subtotalAfterLineDiscounts > 0 ? item.lineTotal / subtotalAfterLineDiscounts : 0;
      const itemNet = Math.max(0, round2(item.lineTotal - proportion * basketDiscountAmt));
      return sum + calculateTaxInclusiveLineVat(itemNet, true);
    }, 0),
  );

  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleConfirmClear = () => {
    setIsClearModalOpen(false);
    onClearBasket();
  };

  const isCartEmpty = cart.length === 0;
  const basketHeaderTitle = `${t('currentBasketHeader')} (${itemCount})`;

  return (
    <aside className="w-[380px] min-w-[380px] bg-surface border-l border-border-subtle flex flex-col h-full flex-shrink-0 select-none">
      {/* 1. Header: Current basket (n) with Hold, Clear, Held Baskets, and Refund icon buttons */}
      <div className="h-14 px-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-surface">
        <h2 className="text-base font-semibold text-text-main leading-none">
          {basketHeaderTitle}
        </h2>

        {/* Secondary Actions with Tooltips */}
        <div className="flex items-center gap-1">
          {/* Refund button */}
          {onOpenRefund && (
            <button
              type="button"
              onClick={onOpenRefund}
              className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 transition-colors duration-fast cursor-pointer"
              title={t('refund')}
              aria-label={t('refund')}
            >
              <RotateCcw size={18} strokeWidth={1.75} />
            </button>
          )}

          {/* Held Baskets Drawer / Resume Button with Badge */}
          {(heldBasketsCount > 0 || hasHeldBasket) && (
            <button
              type="button"
              onClick={onOpenHeldBaskets || onResumeBasket}
              className="relative p-2 rounded-lg text-warning hover:bg-warning-soft transition-colors duration-fast cursor-pointer"
              title={`${t('heldBaskets')} (${heldBasketsCount || 1})`}
              aria-label={t('heldBaskets')}
            >
              <PlayCircle size={18} strokeWidth={1.75} />
              {heldBasketsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-warning text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-xs">
                  {heldBasketsCount}
                </span>
              )}
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
                  {item.discount > 0 && (
                    <span className="text-[11px] font-semibold text-primary block mt-0.5">
                      -{formatCurrency(item.discount)} {t('discount')}
                    </span>
                  )}
                </div>

                {/* Stepper with Editable Quantity */}
                <div className="flex items-center gap-1.5">
                  {!isScale ? (
                    <div className="flex items-center bg-surface-2 rounded-xl p-0.5 border border-border-subtle">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity - 1)}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all duration-fast cursor-pointer"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={15} strokeWidth={1.75} />
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
                        className="w-10 h-10 text-center font-semibold text-[14px] tabular-nums bg-transparent text-text-main focus:outline-none focus:bg-surface rounded-md"
                        aria-label="Item quantity"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(index, item.quantity + 1)}
                        className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface active:scale-95 transition-all duration-fast cursor-pointer"
                        aria-label="Increase quantity"
                      >
                        <Plus size={15} strokeWidth={1.75} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[13px] font-semibold px-2 py-1.5 rounded-lg bg-surface-2 text-text-main border border-border-subtle tabular-nums">
                      {(item.scaleWeightGrams! / 1000).toFixed(3)} kg
                    </span>
                  )}

                  {/* Line Total */}
                  <div className="w-18 text-right">
                    <span className="text-[14px] font-semibold text-text-main tabular-nums font-mono block">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {/* Line Discount Icon */}
                  {onOpenLineDiscount && (
                    <button
                      type="button"
                      onClick={() => onOpenLineDiscount(index)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-fast cursor-pointer ${
                        item.discount > 0
                          ? 'text-primary bg-primary-soft hover:bg-primary-soft/80'
                          : 'text-text-dim hover:text-text-main hover:bg-surface-2'
                      }`}
                      aria-label={t('discount')}
                      title={item.discount > 0 ? `Discount: -${formatCurrency(item.discount)}` : t('discount')}
                    >
                      <Tag size={15} strokeWidth={1.75} />
                    </button>
                  )}

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

      {/* 3. Pinned Footer: Subtotal, Discounts, VAT 15% (included) in muted 14px, divider, Total 32px/700, Pay button 56px */}
      <div className="p-5 border-t border-border-subtle bg-surface flex flex-col gap-3">
        {/* Subtotal, Discounts, and VAT in muted 14px */}
        <div className="flex flex-col gap-1.5 text-[14px]">
          <div className="flex justify-between items-center text-text-muted">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums font-mono font-medium text-text-main text-right">
              {formatCurrency(grossSubtotal)}
            </span>
          </div>

          {/* Discounts Row */}
          {(totalDiscounts > 0 || onOpenBasketDiscount) && (
            <div className="flex justify-between items-center text-[13px]">
              <div className="flex items-center gap-1.5">
                <span className="text-text-muted">{t('discount')}</span>
                {onOpenBasketDiscount && !isCartEmpty && (
                  <button
                    type="button"
                    onClick={onOpenBasketDiscount}
                    className="text-xs text-primary font-semibold hover:underline cursor-pointer flex items-center gap-0.5"
                  >
                    <Tag size={12} strokeWidth={1.75} />
                    <span>{basketDiscount ? t('edit') : `+ ${t('basketDiscount')}`}</span>
                  </button>
                )}
              </div>
              <span className="tabular-nums font-mono font-medium text-primary text-right">
                {totalDiscounts > 0 ? `-${formatCurrency(totalDiscounts)}` : '0.00 ETB'}
              </span>
            </div>
          )}

          {/* VAT Row */}
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
