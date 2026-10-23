import React, { useState, useEffect } from 'react';
import { KeyRound, Delete, ArrowLeft, Store, ShieldAlert, LogIn } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface PinPadModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onSwitchToPassword?: () => void;
  isLockScreen?: boolean;
}

export const PinPadModal: React.FC<PinPadModalProps> = ({
  isOpen,
  onClose,
  onSwitchToPassword,
  isLockScreen = false,
}) => {
  const { pinLogin, unlockSession, isLoading } = useAuth();
  const { t } = useI18n();

  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const next = pin + digit;
      setPin(next);
      setError(null);
      if (next.length >= 4) {
        // Auto-attempt at 4 digits if desired or user can tap Enter
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setError(null);

    const action = isLockScreen ? unlockSession : pinLogin;
    const res = await action(pin);

    if (!res.success) {
      setError(res.error || 'Invalid Cashier PIN');
      setPin('');
    } else {
      if (onClose) onClose();
    }
  };

  // Keyboard support for typing PIN
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape' && !isLockScreen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin, isLockScreen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md select-none animate-in fade-in duration-150"
      style={{ background: 'rgba(15, 23, 42, 0.75)' }}
    >
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-5">
        {/* Terminal / Store Header */}
        <div className="flex flex-col items-center text-center gap-1.5">
          <div className="w-12 h-12 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-md shadow-gebeya-600/30">
            <KeyRound size={24} />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {isLockScreen ? t('lockTerminal') : t('pinLogin')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isLockScreen ? 'Terminal locked. Enter your PIN to resume.' : 'Enter your 4-6 digit cashier PIN'}
          </p>
        </div>

        {/* PIN Dots Display */}
        <div className="flex items-center gap-3 my-2">
          {[0, 1, 2, 3, 4, 5].map((idx) => {
            const isFilled = idx < pin.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-150 ${
                  isFilled
                    ? 'bg-gebeya-600 scale-110 shadow-sm shadow-gebeya-600/50'
                    : 'bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {error && (
          <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 flex items-center gap-1.5 animate-shake">
            <ShieldAlert size={14} />
            <span>{error}</span>
          </div>
        )}

        {/* Number Pad Grid */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-2xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-xs"
            >
              {digit}
            </button>
          ))}

          {/* Clear */}
          <button
            type="button"
            onClick={handleClear}
            className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs font-bold transition-all active:scale-95 flex items-center justify-center uppercase tracking-wider"
          >
            Clear
          </button>

          {/* 0 */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-2xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-xs"
          >
            0
          </button>

          {/* Backspace */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-lg font-bold transition-all active:scale-95 flex items-center justify-center"
          >
            <Delete size={20} />
          </button>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={pin.length < 4 || isLoading}
          className="btn-primary w-full py-3 text-sm font-bold rounded-2xl justify-center mt-1 disabled:opacity-50"
        >
          {isLoading ? 'Verifying PIN...' : 'Unlock Terminal (Enter)'}
        </button>

        {/* Switch to Password login */}
        {onSwitchToPassword && (
          <button
            type="button"
            onClick={onSwitchToPassword}
            className="text-xs font-semibold text-gebeya-600 hover:underline flex items-center gap-1.5"
          >
            <LogIn size={13} />
            {t('backOfficeLogin')}
          </button>
        )}

        <div className="text-[11px] text-slate-400">
          Demo Cashier PIN: <strong className="font-mono text-slate-600 dark:text-slate-300">1234</strong>
        </div>
      </div>
    </div>
  );
};
