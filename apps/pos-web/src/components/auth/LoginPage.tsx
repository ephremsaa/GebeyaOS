import React, { useState } from 'react';
import { Store, Wifi, Lock, User, Eye, EyeOff, KeyRound, Globe, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';

interface LoginPageProps {
  onSwitchToPin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToPin }) => {
  const { login, isLoading } = useAuth();
  const { t, language, setLanguage } = useI18n();

  const [usernameOrPhone, setUsernameOrPhone] = useState('admin');
  const [password, setPassword] = useState('Admin@123456');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const res = await login(usernameOrPhone, password);
    if (!res.success) {
      setError(res.error || 'Login failed.');
      if (res.remainingSeconds) {
        setRemainingSeconds(res.remainingSeconds);
      }
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-4 relative select-none"
      style={{ background: 'var(--bg-page)', color: 'var(--text-main)' }}
    >
      {/* Top Bar for Offline Indicator & Language */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-600 dark:text-slate-300">{t('workingOfflineBadge')}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs">
          <Globe size={14} className="text-slate-400 ml-1.5" />
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-all ${
              language === 'en'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('am')}
            className={`px-2 py-1 text-xs font-bold rounded-lg transition-all ${
              language === 'am'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            አማ
          </button>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col gap-6">
        {/* Brand */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-lg shadow-gebeya-600/30">
            <Store size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">{t('loginTitle')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('loginSubtitle')}</p>
        </div>

        {/* Error / Lockout Banner */}
        {error && (
          <div className="alert-danger flex items-start gap-2 text-sm p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span>{error}</span>
              {remainingSeconds && (
                <span className="text-xs font-mono font-bold mt-1">
                  Remaining lock time: {remainingSeconds}s
                </span>
              )}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="field-label">{t('usernameOrPhone')}</label>
            <div className="relative mt-1">
              <User
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                required
                className="field-input pl-10"
                placeholder="admin or +251 91 122 3344"
                value={usernameOrPhone}
                onChange={(e) => setUsernameOrPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">{t('password')}</label>
            <div className="relative mt-1">
              <Lock
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                className="field-input pl-10 pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 text-base font-bold rounded-2xl mt-2 justify-center shadow-md shadow-gebeya-600/25 active:scale-98 transition-all"
          >
            {isLoading ? 'Verifying...' : t('loginAction')}
          </button>
        </form>

        {/* Divider & PIN login option */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
        </div>

        {onSwitchToPin && (
          <button
            type="button"
            onClick={onSwitchToPin}
            className="btn-secondary w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"
          >
            <KeyRound size={16} className="text-gebeya-600" />
            {t('pinLogin')}
          </button>
        )}

        {/* Seed helper hint */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center leading-relaxed">
          Default Admin: <strong className="text-slate-700 dark:text-slate-200 font-mono">admin</strong> / Password: <strong className="text-slate-700 dark:text-slate-200 font-mono">Admin@123456</strong>
        </div>
      </div>
    </div>
  );
};
