import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

export const SessionExpiredDialog: React.FC = () => {
  const { isSessionExpired, currentUser, reauthenticate, logout } = useAuth();
  const { t, language } = useI18n();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isSessionExpired) return null;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await reauthenticate(password);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || (language === 'am' ? 'ማረጋገጥ አልተቻለም። እባክዎ የይለፍ ቃልዎን ያረጋግጡ።' : 'Failed to authenticate. Please check your password.'));
    } else {
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="w-full max-w-md bg-surface border border-border-subtle rounded-3xl p-6 sm:p-8 shadow-modal flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-warning-soft text-warning flex items-center justify-center shrink-0">
            <Lock size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-main">{t('auth.sessionExpiredTitle')}</h2>
            <p className="text-xs text-text-muted">
              @{currentUser?.username || 'user'} • {currentUser?.fullName || t('common.cashier')}
            </p>
          </div>
        </div>

        <p className="text-xs text-text-muted leading-relaxed">
          {t('auth.sessionExpiredDesc')}
        </p>

        {error && (
          <div className="p-3 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 pr-10 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-sm focus:outline-hidden focus:border-primary text-text-main font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !password.trim()}
            className="btn-primary w-full py-3 rounded-2xl font-bold text-sm shadow-md"
          >
            {isSubmitting ? (language === 'am' ? 'በማረጋገጥ ላይ...' : 'Verifying...') : t('auth.unlockSession')}
          </button>

          <button
            type="button"
            onClick={logout}
            className="text-xs text-text-muted hover:text-danger flex items-center justify-center gap-1.5 pt-1 cursor-pointer transition-colors"
          >
            <LogOut size={13} />
            <span>{language === 'am' ? 'ሙሉ በሙሉ ውጣ' : 'Log out completely'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
