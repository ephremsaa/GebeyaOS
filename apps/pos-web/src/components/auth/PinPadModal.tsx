import React, { useState, useEffect, useMemo } from 'react';
import {
  KeyRound,
  Delete,
  Store,
  ShieldAlert,
  LogIn,
  Search,
  UserCheck,
  Lock,
  RotateCcw,
  Clock,
  Terminal,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { CashierSummary } from '@gebeyaos/shared-types';

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
  const {
    pinLogin,
    unlockSession,
    getCashiers,
    currentUser,
    terminalConfig,
    isLoading,
  } = useAuth();
  const { t } = useI18n();

  // Cashier list & selection
  const [cashiers, setCashiers] = useState<CashierSummary[]>([]);
  const [cashierSearch, setCashierSearch] = useState('');
  const [selectedCashier, setSelectedCashier] = useState<CashierSummary | null>(null);

  // PIN state
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [remainingLockSeconds, setRemainingLockSeconds] = useState<number | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Load cashiers when opened
  useEffect(() => {
    if (isOpen) {
      loadCashiers();
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  // Lock countdown timer
  useEffect(() => {
    if (remainingLockSeconds && remainingLockSeconds > 0) {
      const timer = setInterval(() => {
        setRemainingLockSeconds((prev) => (prev && prev > 1 ? prev - 1 : null));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [remainingLockSeconds]);

  const loadCashiers = async () => {
    try {
      const list = await getCashiers();
      setCashiers(list);
      // Auto-select current cashier if locked, or select first available
      if (currentUser) {
        const found = list.find((c) => c.id === currentUser.id);
        if (found) setSelectedCashier(found);
      } else if (list.length > 0) {
        setSelectedCashier(list[0]);
      }
    } catch {
      // fallback handled in context
    }
  };

  const filteredCashiers = useMemo(() => {
    if (!cashierSearch.trim()) return cashiers;
    const q = cashierSearch.toLowerCase();
    return cashiers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q),
    );
  }, [cashiers, cashierSearch]);

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
      const next = pin + digit;
      setPin(next);
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

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('PIN must be 4 to 6 digits');
      triggerHaptic([100, 50, 100]);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      return;
    }

    setError(null);
    const targetUserId = selectedCashier?.id;
    const action = isLockScreen ? unlockSession : pinLogin;
    const res = await action(pin, targetUserId);

    if (!res.success) {
      setError(res.error || 'Invalid Cashier PIN');
      triggerHaptic([150, 50, 150]);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);
      setPin('');
      if (res.remainingSeconds) {
        setRemainingLockSeconds(res.remainingSeconds);
      }
    } else {
      triggerHaptic([80]);
      if (onClose) onClose();
    }
  };

  // Physical keyboard handling
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
  }, [isOpen, pin, selectedCashier, isLockScreen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md select-none animate-in fade-in duration-150"
      style={{ background: 'rgba(15, 23, 42, 0.85)' }}
    >
      <div className="w-full max-w-4xl bg-surface border border-border-subtle rounded-3xl shadow-modal overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* LEFT COLUMN: Cashier Roster & Terminal Info */}
        <div className="w-full md:w-80 bg-surface-2 border-b md:border-b-0 md:border-r border-border-subtle p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
                <Store size={18} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-text-main">
                  {terminalConfig?.terminalName || 'POS Terminal'}
                </h3>
                <span className="text-[10px] font-mono text-text-muted">
                  Lane: {terminalConfig?.terminalCode || 'POS-01'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Offline Ready</span>
            </div>
          </div>

          {/* Search Cashiers */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder={t('searchCashier')}
              value={cashierSearch}
              onChange={(e) => setCashierSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs text-text-main focus:outline-hidden focus:border-primary"
            />
          </div>

          {/* Cashier Avatar Tiles */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-2 max-h-72 md:max-h-96 pr-1">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('cashierAvatarSelect')}
            </span>

            {filteredCashiers.length === 0 ? (
              <p className="text-xs text-text-muted py-4 text-center">No cashiers found</p>
            ) : (
              filteredCashiers.map((cashier) => {
                const isSelected = selectedCashier?.id === cashier.id;
                const initials = cashier.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <button
                    key={cashier.id}
                    type="button"
                    onClick={() => {
                      setSelectedCashier(cashier);
                      setPin('');
                      setError(null);
                    }}
                    className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary-soft/40 border-primary shadow-soft'
                        : 'bg-surface hover:bg-surface-2 border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs ${
                          isSelected
                            ? 'bg-primary text-white'
                            : 'bg-surface-2 text-text-muted border border-border-subtle'
                        }`}
                      >
                        {initials}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-text-main leading-snug">
                          {cashier.fullName}
                        </span>
                        <span className="text-[11px] text-text-muted font-mono">
                          @{cashier.username}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border-subtle">
                        {cashier.role}
                      </span>
                      {cashier.isLocked && (
                        <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                          <Lock size={10} /> Locked
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Touch Number Pad (64px Keys) & PIN Dots */}
        <div className="flex-1 p-6 md:p-8 flex flex-col items-center justify-center gap-5">
          {/* Active Cashier Display */}
          <div className="flex flex-col items-center text-center gap-1">
            <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shadow-primary/25">
              <KeyRound size={26} />
            </div>
            <h2 className="text-lg font-black text-text-main mt-1">
              {isLockScreen ? t('lockTerminal') : t('pinLogin')}
            </h2>
            <p className="text-xs text-text-muted">
              {selectedCashier
                ? `Signing in as ${selectedCashier.fullName}`
                : 'Select a cashier and enter 4-6 digit PIN'}
            </p>
          </div>

          {/* Entered Digits Display Dots */}
          <div
            className={`flex items-center gap-3.5 my-1 transition-transform ${
              isShaking ? 'animate-shake' : ''
            }`}
          >
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const isFilled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full transition-all duration-150 ${
                    isFilled
                      ? 'bg-primary scale-125 shadow-md shadow-primary/40'
                      : 'bg-surface-2 border border-border-subtle'
                  }`}
                />
              );
            })}
          </div>

          {/* Error / Lockout Banner */}
          {error && (
            <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-4 py-2 rounded-2xl border border-red-500/20 flex items-center gap-2 max-w-sm text-center">
              <ShieldAlert size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {remainingLockSeconds && remainingLockSeconds > 0 && (
            <div className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20 flex items-center gap-1.5">
              <Clock size={14} />
              <span>
                Lockout remaining: {Math.floor(remainingLockSeconds / 60)}m{' '}
                {remainingLockSeconds % 60}s
              </span>
            </div>
          )}

          {/* 64px Touch Number Pad Grid */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="h-16 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-main text-2xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-xs border border-border-subtle cursor-pointer"
              >
                {digit}
              </button>
            ))}

            {/* Clear */}
            <button
              type="button"
              onClick={handleClear}
              className="h-16 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-muted hover:text-text-main text-xs font-bold transition-all active:scale-95 flex items-center justify-center uppercase tracking-wider border border-border-subtle cursor-pointer"
            >
              Clear
            </button>

            {/* 0 */}
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-16 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-main text-2xl font-bold transition-all active:scale-95 flex items-center justify-center shadow-xs border border-border-subtle cursor-pointer"
            >
              0
            </button>

            {/* Backspace */}
            <button
              type="button"
              onClick={handleBackspace}
              className="h-16 w-full rounded-2xl bg-surface-2 hover:bg-border-subtle text-text-muted hover:text-text-main text-lg font-bold transition-all active:scale-95 flex items-center justify-center border border-border-subtle cursor-pointer"
            >
              <Delete size={22} />
            </button>
          </div>

          {/* Submit Action */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pin.length < 4 || isLoading}
            className="btn-primary w-full max-w-[280px] py-3.5 text-sm font-bold rounded-2xl justify-center shadow-md shadow-primary/25 disabled:opacity-50 active:scale-98 cursor-pointer"
          >
            {isLoading ? 'Verifying PIN...' : 'Enter PIN (Submit)'}
          </button>

          {/* Bottom Bar: Switch to Password / Cancel */}
          <div className="flex items-center gap-4 text-xs">
            {onSwitchToPassword && (
              <button
                type="button"
                onClick={onSwitchToPassword}
                className="font-semibold text-primary hover:underline flex items-center gap-1.5 cursor-pointer"
              >
                <LogIn size={13} />
                <span>{t('backOfficeLogin')}</span>
              </button>
            )}

            {!isLockScreen && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-text-muted hover:text-text-main font-semibold cursor-pointer"
              >
                {t('cancel')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
