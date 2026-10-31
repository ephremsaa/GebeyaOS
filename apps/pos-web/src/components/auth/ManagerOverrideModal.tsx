import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, KeyRound, Delete, X } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { ManagerOverrideResult } from '@gebeyaos/shared-types';

interface ManagerOverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorized: (result: ManagerOverrideResult) => void;
  actionTitle: string;
  action: string;
  requiredPermission?: string;
  amount?: number;
  notes?: string;
}

export const ManagerOverrideModal: React.FC<ManagerOverrideModalProps> = ({
  isOpen,
  onClose,
  onAuthorized,
  actionTitle,
  action,
  requiredPermission,
  amount,
  notes,
}) => {
  const { managerOverride } = useAuth();
  const { t } = useI18n();

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  const triggerHaptic = (pattern: number[]) => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {}
  };

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      triggerHaptic([40]);
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleBackspace = () => {
    triggerHaptic([30]);
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    triggerHaptic([30]);
    setPin('');
    setError(null);
  };

  const handleAuthorize = async () => {
    if (pin.length < 4) {
      setError('Manager PIN must be at least 4 digits');
      triggerHaptic([100, 50, 100]);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setIsAuthorizing(true);
    setError(null);

    const res = await managerOverride({
      managerPin: pin,
      action,
      requiredPermission: requiredPermission || 'pos:sale:discount',
      amount,
      notes,
    });

    setIsAuthorizing(false);

    if (res.authorized) {
      triggerHaptic([80]);
      onAuthorized(res);
      onClose();
    } else {
      setError(res.error || 'Manager PIN rejected. Insufficient permissions.');
      triggerHaptic([150, 50, 150]);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md select-none animate-in fade-in"
      style={{ background: 'rgba(15, 23, 42, 0.8)' }}
    >
      <div className="w-full max-w-sm bg-surface border border-border-subtle rounded-3xl p-6 shadow-modal flex flex-col items-center gap-5">
        {/* Header */}
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-main">{t('managerOverrideTitle')}</h3>
              <p className="text-[11px] text-text-muted">{actionTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-2 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Action Details Pill */}
        <div className="w-full p-3 rounded-2xl bg-surface-2 border border-border-subtle text-xs flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-text-muted">Required Action:</span>
            <span className="font-bold text-text-main">{action}</span>
          </div>
          {amount !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Amount / Value:</span>
              <span className="font-mono font-bold text-primary">{amount} ETB</span>
            </div>
          )}
          {notes && (
            <p className="text-[11px] text-text-muted italic border-t border-border-subtle pt-1 mt-0.5">
              "{notes}"
            </p>
          )}
        </div>

        {/* Dots */}
        <div
          className={`flex items-center gap-3 my-1 transition-transform ${
            isShaking ? 'animate-shake' : ''
          }`}
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  isFilled
                    ? 'bg-amber-500 scale-125 shadow-md shadow-amber-500/40'
                    : 'bg-surface-2 border border-border-subtle'
                }`}
              />
            );
          })}
        </div>

        {error && (
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20 flex items-center gap-1.5">
            <ShieldAlert size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 64px Number Pad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-main text-xl font-bold transition-all active:scale-95 flex items-center justify-center border border-border-subtle cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-muted hover:text-text-main text-xs font-bold transition-all active:scale-95 flex items-center justify-center uppercase tracking-wider border border-border-subtle cursor-pointer"
          >
            Clear
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-main text-xl font-bold transition-all active:scale-95 flex items-center justify-center border border-border-subtle cursor-pointer"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-muted hover:text-text-main text-base font-bold transition-all active:scale-95 flex items-center justify-center border border-border-subtle cursor-pointer"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Authorize Action Button */}
        <button
          type="button"
          onClick={handleAuthorize}
          disabled={pin.length < 4 || isAuthorizing}
          className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 active:scale-98 disabled:opacity-50 transition-all cursor-pointer"
        >
          {isAuthorizing ? 'Authorizing...' : t('authorizeAction')}
        </button>
      </div>
    </div>
  );
};

