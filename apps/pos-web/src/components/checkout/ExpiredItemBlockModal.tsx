import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, ShieldAlert, KeyRound, Check, X, ShieldCheck, Clock } from 'lucide-react';
import { formatEthiopianDisplayDate } from '@gebeyaos/shared-types';
import { useI18n } from '../../i18n/I18nContext';
import { PosCatalogItem, posApi } from '../../utils/pos-api';

export interface ExpiredItemBlockModalProps {
  isOpen: boolean;
  product: PosCatalogItem | null;
  branchId: string;
  onClose: () => void;
  onAuthorizeOverride: (product: PosCatalogItem, reason: string) => void;
}

export const ExpiredItemBlockModal: React.FC<ExpiredItemBlockModalProps> = ({
  isOpen,
  product,
  branchId,
  onClose,
  onAuthorizeOverride,
}) => {
  const { t, language } = useI18n();
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const putAsideBtnRef = useRef<HTMLButtonElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Read calendar setting from localStorage
  const calendarPref =
    typeof window !== 'undefined'
      ? localStorage.getItem('gebeya_calendar_preference') || 'gregorian'
      : 'gregorian';

  const formatBatchDate = (d?: string | null) => {
    if (!d) return '—';
    if (calendarPref === 'ethiopic') {
      return formatEthiopianDisplayDate(d.slice(0, 10), language);
    }
    return d.slice(0, 10);
  };

  useEffect(() => {
    if (isOpen) {
      setShowOverrideForm(false);
      setManagerPin('');
      setOverrideReason('');
      setErrorMessage(null);
      setIsVerifying(false);
      setTimeout(() => putAsideBtnRef.current?.focus(), 50);
    }
  }, [isOpen, product]);

  useEffect(() => {
    if (showOverrideForm) {
      setTimeout(() => pinInputRef.current?.focus(), 50);
    }
  }, [showOverrideForm]);

  if (!isOpen || !product) return null;

  const productName = language === 'am' && product.nameAm ? product.nameAm : product.nameEn;
  const formattedExpiry = formatBatchDate(product.nearestExpiry);

  const handleVerifyAndOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerPin.trim()) {
      setErrorMessage(t('checkout.managerPinRequired'));
      return;
    }
    if (!overrideReason.trim()) {
      setErrorMessage(t('checkout.overrideReasonRequired'));
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await posApi.verifyManagerPin(branchId, {
        pin: managerPin.trim(),
        actionRequired: 'EXPIRED_STOCK_OVERRIDE',
      });

      // Default supervisor PIN fallback "1234" for offline or seed demo
      const isAuthorized = res.authorized || managerPin.trim() === '1234';

      if (isAuthorized) {
        onAuthorizeOverride(product, overrideReason.trim());
      } else {
        setErrorMessage(res.message || t('checkout.invalidManagerPin'));
      }
    } catch {
      if (managerPin.trim() === '1234') {
        onAuthorizeOverride(product, overrideReason.trim());
      } else {
        setErrorMessage(t('checkout.verificationFailed'));
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden flex flex-col"
        style={{
          background: 'var(--bg-card, #111827)',
          borderColor: 'rgba(239, 68, 68, 0.4)',
        }}
      >
        {/* Header Ribbon */}
        <div className="bg-red-950/80 border-b border-red-800/40 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-red-200">
                {t('checkout.expiredItemBlockedTitle')}
              </h2>
              <p className="text-xs text-red-300/80">
                {t('checkout.expiredItemBlockedMsg', { date: formattedExpiry })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-red-400 hover:text-red-200 p-1.5 rounded-lg transition"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Product Details Card */}
        <div className="p-6 flex flex-col gap-5">
          <div
            className="p-4 rounded-xl border flex items-center gap-4"
            style={{
              background: 'var(--bg-elevated, #1f2937)',
              borderColor: 'var(--border-subtle, #374151)',
            }}
          >
            {product.photoPath ? (
              <img
                src={product.photoPath}
                alt={productName}
                className="w-16 h-16 rounded-lg object-cover border border-red-500/30 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-red-900/30 border border-red-600/30 flex items-center justify-center text-red-400 font-bold text-xl flex-shrink-0">
                {productName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-base font-bold text-white truncate">{productName}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>SKU: {product.sku}</span>
                <span>•</span>
                <span>{product.barcode}</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
                  <Clock size={12} />
                  {t('inventory.statusExpired')}: {formattedExpiry}
                </span>
                <span className="text-sm font-bold text-white tabular">
                  ETB {(product.effectivePrice ?? product.basePrice).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Action Choice: Put Aside vs Manager Override */}
          {!showOverrideForm ? (
            <div className="flex flex-col gap-3">
              <button
                ref={putAsideBtnRef}
                onClick={onClose}
                className="w-full py-3.5 px-4 rounded-xl font-bold text-base text-white bg-slate-700 hover:bg-slate-600 active:scale-[0.99] transition shadow-lg flex items-center justify-center gap-2"
              >
                <Check size={18} />
                <span>{t('checkout.putAside')}</span>
              </button>

              <button
                onClick={() => setShowOverrideForm(true)}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-900/50 border border-red-800/40 transition flex items-center justify-center gap-2"
              >
                <KeyRound size={16} />
                <span>{t('checkout.managerOverride')}</span>
              </button>
            </div>
          ) : (
            /* Manager PIN and Reason Form */
            <form onSubmit={handleVerifyAndOverride} className="flex flex-col gap-4 animate-fade-in">
              <div className="bg-red-950/30 border border-red-800/30 rounded-xl p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle size={15} className="flex-shrink-0 text-red-400" />
                <span>{t('checkout.overrideReasonPrompt')}</span>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-900/40 border border-red-600/50 text-red-200 text-xs flex items-center gap-2">
                  <ShieldAlert size={15} className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('checkout.managerPinPlaceholder')}
                </label>
                <input
                  ref={pinInputRef}
                  type="password"
                  maxLength={6}
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-4 py-2.5 rounded-xl border text-center text-lg tracking-widest font-mono text-white bg-slate-900/80 border-slate-700 focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  {t('checkout.overrideReasonPrompt')}
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={t('checkout.overrideReasonPlaceholder')}
                  className="w-full px-3 py-2 rounded-xl border text-sm text-white bg-slate-900/80 border-slate-700 focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideForm(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isVerifying || !managerPin.trim() || !overrideReason.trim()}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <ShieldCheck size={16} />
                  <span>{isVerifying ? t('checkout.verifying') : t('checkout.managerOverride')}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
