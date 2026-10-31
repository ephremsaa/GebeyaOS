import React, { useState } from 'react';
import { RotateCcw, Search, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { Modal, Button, Input } from '../ui';
import { posApi } from '../../utils/pos-api';
import { SaleRecord } from '@gebeyaos/shared-types';

export interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchId: string;
  cashierId: string;
  currentShiftId: string;
}

export const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  onClose,
  branchId,
  cashierId,
  currentShiftId,
}) => {
  const { t, formatCurrency } = useI18n();
  const [receiptNumber, setReceiptNumber] = useState('');
  const [originalSale, setOriginalSale] = useState<SaleRecord | null>(null);
  const [selectedItems, setSelectedItems] = useState<{ [saleItemId: string]: number }>({});
  const [reason, setReason] = useState('Customer returned goods');
  const [returnToInventory, setReturnToInventory] = useState(true);
  const [managerPin, setManagerPin] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedRefundNo, setCompletedRefundNo] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!receiptNumber.trim()) return;
    try {
      setIsSearching(true);
      setErrorMsg(null);
      const sale = await posApi.getSaleByReceiptNumber(branchId, receiptNumber.trim());
      setOriginalSale(sale);
      // Default select all items with their full quantity
      const initSelection: { [id: string]: number } = {};
      sale.items?.forEach((i) => {
        initSelection[i.id] = i.quantity;
      });
      setSelectedItems(initSelection);
    } catch (err: any) {
      setErrorMsg(err.message || 'Receipt not found');
      setOriginalSale(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleProcessRefund = async () => {
    if (!originalSale) return;
    if (!managerPin.trim()) {
      setErrorMsg('Manager PIN is mandatory for processing refunds');
      return;
    }

    const itemsToRefund = Object.entries(selectedItems)
      .filter(([_, qty]) => qty > 0)
      .map(([saleItemId, qty]) => ({
        originalSaleItemId: saleItemId,
        quantity: qty,
        returnToInventory,
      }));

    if (itemsToRefund.length === 0) {
      setErrorMsg('Please select at least one item to refund');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      // 1. Verify manager PIN
      const auth = await posApi.verifyManagerPin(branchId, {
        pin: managerPin.trim(),
        actionRequired: 'REFUND_AUTH',
      });
      if (!auth.authorized) {
        setErrorMsg(auth.message || 'Invalid Manager PIN');
        return;
      }

      // 2. Submit refund
      const res = await posApi.refundSale(branchId, cashierId, {
        originalSaleId: originalSale.id,
        authorizedBy: auth.authorizedBy || cashierId,
        shiftId: currentShiftId,
        reason,
        items: itemsToRefund,
      });

      setCompletedRefundNo(res.refundNumber);
    } catch (err: any) {
      setErrorMsg(err.message || 'Refund processing failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('refundTitle')}
      maxWidth="lg"
    >
      <div className="flex flex-col gap-4 py-1">
        {completedRefundNo ? (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-primary-soft text-primary flex items-center justify-center mb-3">
              <CheckCircle2 size={36} strokeWidth={2} />
            </div>
            <h3 className="text-xl font-bold text-text-main">
              Refund Processed Successfully
            </h3>
            <p className="text-sm text-text-muted mt-1 font-mono">
              Credit Note: <strong>{completedRefundNo}</strong>
            </p>
            <div className="mt-6">
              <Button variant="primary" onClick={onClose}>
                {t('close')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* 1. Receipt Lookup Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-fast"
                placeholder={t('originalReceiptLookup')}
              />
              <Button
                variant="secondary"
                onClick={handleLookup}
                disabled={isSearching || !receiptNumber.trim()}
              >
                <Search size={16} className="mr-1.5" />
                {t('lookupReceipt')}
              </Button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger-soft text-danger text-sm font-medium flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* 2. Sale Items Selection */}
            {originalSale && (
              <div className="flex flex-col gap-3">
                <div className="border border-border-subtle rounded-xl divide-y divide-border-subtle max-h-56 overflow-y-auto">
                  {originalSale.items?.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 flex items-center justify-between text-sm hover:bg-surface-2/40"
                    >
                      <div className="flex-1 pr-2">
                        <span className="font-semibold text-text-main block truncate">
                          {item.itemNameSnapshot}
                        </span>
                        <span className="text-xs text-text-muted">
                          Original: {item.quantity} × {formatCurrency(item.unitPrice)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Return:</span>
                        <input
                          type="number"
                          min="0"
                          max={item.quantity}
                          step="any"
                          value={selectedItems[item.id] ?? 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setSelectedItems((prev) => ({
                              ...prev,
                              [item.id]: Math.min(item.quantity, Math.max(0, val)),
                            }));
                          }}
                          className="w-16 px-2 py-1 text-center font-mono font-semibold rounded-lg border border-border-subtle bg-surface text-text-main text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Restock Toggle & Reason */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      {t('refundReason')}
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border-subtle bg-surface text-text-main"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-main mb-1">
                      {t('managerPinRequiredTitle')}
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tracking-widest text-center font-bold rounded-lg border border-border-subtle bg-surface text-text-main"
                      placeholder="PIN"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-text-main cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={returnToInventory}
                    onChange={(e) => setReturnToInventory(e.target.checked)}
                    className="rounded border-border-subtle text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                  />
                  <span>{t('restockInventory')}</span>
                </label>

                <div className="grid grid-cols-2 gap-3 mt-2">
                  <Button variant="secondary" onClick={onClose}>
                    {t('cancel')}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleProcessRefund}
                    disabled={isSubmitting || !managerPin.trim()}
                  >
                    <RotateCcw size={16} className="mr-1.5" />
                    {isSubmitting ? 'Processing...' : t('processRefund')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
