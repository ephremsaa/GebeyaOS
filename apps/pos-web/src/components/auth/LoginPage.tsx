import React, { useState, useEffect } from 'react';
import {
  Store,
  Wifi,
  Lock,
  User,
  Eye,
  EyeOff,
  KeyRound,
  Globe,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Check,
  Building2,
  Phone,
  Mail,
  Key,
} from 'lucide-react';
import { useAuth, AssignedBranch } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { calculatePasswordStrength } from '../../utils/password-meter';

interface LoginPageProps {
  onSwitchToPin?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToPin }) => {
  const {
    login,
    isLoading,
    companyCode,
    companyInfo,
    checkCompanyCode,
    setCompanyCode,
    selectBranch,
    forgotPassword,
    resetPassword,
    updateUserPassword,
  } = useAuth();
  const { t, language, setLanguage } = useI18n();

  // Multi-step flow state
  // Step 1: Company Code, Step 2: Credentials, Step 3: Branch Selection
  const [currentStep, setCurrentStep] = useState<'company' | 'credentials' | 'branches'>(
    companyCode && companyInfo ? 'credentials' : 'company',
  );

  const [inputCompanyCode, setInputCompanyCode] = useState(companyCode || '');
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);

  // Credentials
  const [usernameOrPhone, setUsernameOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isSuspended, setIsSuspended] = useState<boolean>(false);

  // Multi-branch state
  const [branches, setBranches] = useState<AssignedBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  // Force Password Change state
  const [isForcedPasswordChange, setIsForcedPasswordChange] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forceChangeError, setForceChangeError] = useState<string | null>(null);

  // Forgot password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset'>('request');
  const [forgotUsername, setForgotUsername] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Password strength meter
  const passStrength = calculatePasswordStrength(password);
  const newPassStrength = calculatePasswordStrength(newPassword);
  const resetPassStrength = calculatePasswordStrength(resetNewPass);

  // Auto-verify prefilled company code on mount
  useEffect(() => {
    if (companyCode) {
      checkCompanyCode(companyCode).then((res) => {
        if (res.success) {
          setCurrentStep('credentials');
        } else if (res.isSuspended) {
          setIsSuspended(true);
        }
      });
    }
  }, [companyCode, checkCompanyCode]);

  // Step 1: Submit Company Code
  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCompanyError(null);
    setIsSuspended(false);
    setCompanyLoading(true);

    const res = await checkCompanyCode(inputCompanyCode);
    setCompanyLoading(false);

    if (res.success) {
      setCurrentStep('credentials');
    } else {
      if (res.isSuspended) {
        setIsSuspended(true);
      }
      setCompanyError(res.error || 'Supermarket not found for this company code.');
    }
  };

  // Step 2: Submit Credentials
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSuspended(false);

    const res = await login(
      usernameOrPhone,
      password,
      inputCompanyCode,
      requires2FA ? totpCode : undefined,
    );

    if (res.success) {
      if (res.forcePasswordChange) {
        setIsForcedPasswordChange(true);
        return;
      }
      if (res.branches && res.branches.length > 1) {
        setBranches(res.branches);
        setSelectedBranchId(res.branches[0].id);
        setCurrentStep('branches');
        return;
      }
    } else {
      if (res.requires2FA) {
        setRequires2FA(true);
        return;
      }
      if (res.isSuspended) {
        setIsSuspended(true);
      }
      setError(res.error || 'Login failed.');
      if (res.remainingSeconds) {
        setRemainingSeconds(res.remainingSeconds);
      }
    }
  };

  // Force Password Change submit
  const handleForcePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForceChangeError(null);

    if (newPassword !== confirmPassword) {
      setForceChangeError('Passwords do not match');
      return;
    }
    if (!newPassStrength.isValid) {
      setForceChangeError('Password must be at least 10 characters and cannot be a common password.');
      return;
    }

    const res = await updateUserPassword(password, newPassword);
    if (res.success) {
      setIsForcedPasswordChange(false);
    } else {
      setForceChangeError(res.error || 'Failed to update password');
    }
  };

  // Branch Selection submit
  const handleBranchSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBranchId) {
      selectBranch(selectedBranchId);
    }
  };

  // Forgot password flows
  const handleSendResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotMsg(null);

    const res = await forgotPassword(inputCompanyCode, forgotUsername.trim());
    if (res.success) {
      setForgotMsg(res.message || 'If an account exists, a 6-digit code has been dispatched.');
      setForgotStep('reset');
    } else {
      setForgotError(res.error || 'Unable to send reset code');
    }
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!resetPassStrength.isValid) {
      setForgotError('Password must be at least 10 characters and not easily guessable.');
      return;
    }

    const res = await resetPassword(
      inputCompanyCode,
      forgotUsername.trim(),
      resetCode.trim(),
      resetNewPass,
    );

    if (res.success) {
      setShowForgotModal(false);
      setPassword(resetNewPass);
      setError(null);
      setForgotMsg('Password changed successfully! You may now sign in.');
    } else {
      setForgotError(res.error || 'Failed to reset password. Code may have expired.');
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-4 relative select-none"
      style={{ background: 'var(--bg-page)', color: 'var(--text-main)' }}
    >
      {/* Top Header: Offline status badge + Language toggle */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold shadow-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-600 dark:text-slate-300">{t('workingOfflineBadge')}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 rounded-xl shadow-xs">
          <Globe size={14} className="text-slate-400 ml-1.5" />
          <button
            type="button"
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
            type="button"
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
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col gap-5 z-10">
        {/* Brand / Logo */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-2xl bg-gebeya-600 text-white flex items-center justify-center shadow-lg shadow-gebeya-600/30">
            <Store size={30} />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {companyInfo ? companyInfo.name : t('loginTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {companyInfo?.receiptHeader || t('loginSubtitle')}
          </p>
        </div>

        {/* Suspended Supermarket Banner */}
        {isSuspended && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
            <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
            <div className="flex flex-col gap-1">
              <strong className="font-semibold">{t('tenantSuspendedNotice')}</strong>
              <span className="text-[11px] text-amber-600/90 dark:text-amber-400/90">
                LAN offline operations remain active during the designated grace period.
              </span>
            </div>
          </div>
        )}

        {/* Error / Lockout Banner */}
        {error && (
          <div className="flex items-start gap-2 text-xs p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span>{error}</span>
              {remainingSeconds && (
                <span className="text-[11px] font-mono font-bold mt-1">
                  Remaining lock time: {remainingSeconds}s
                </span>
              )}
            </div>
          </div>
        )}

        {/* STEP 1: Company Code Input */}
        {currentStep === 'company' && (
          <form onSubmit={handleCompanySubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('companyCodeLabel')}
              </label>
              <div className="relative">
                <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder={t('companyCodePlaceholder')}
                  value={inputCompanyCode}
                  onChange={(e) => setInputCompanyCode(e.target.value.toLowerCase())}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm font-semibold uppercase tracking-wider focus:outline-hidden focus:border-gebeya-500 transition-all"
                />
              </div>
              {companyError && <p className="text-[11px] text-red-500 mt-1.5">{companyError}</p>}
            </div>

            <button
              type="submit"
              disabled={companyLoading || !inputCompanyCode.trim()}
              className="btn-primary w-full py-3 rounded-2xl font-bold text-sm shadow-md shadow-gebeya-600/20 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              {companyLoading ? 'Checking...' : t('companyCodeContinue')} <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* STEP 2: Credentials Form */}
        {currentStep === 'credentials' && !isForcedPasswordChange && (
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
            {/* Active Company Pill & Change button */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-gebeya-600" />
                <span className="font-bold text-slate-700 dark:text-slate-200 uppercase">
                  {inputCompanyCode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep('company')}
                className="text-[11px] font-semibold text-gebeya-600 hover:underline cursor-pointer"
              >
                {t('companyCodeChange')}
              </button>
            </div>

            {/* Username or Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('usernameOrPhone')}
              </label>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="admin or +251 91 122 3344"
                  value={usernameOrPhone}
                  onChange={(e) => setUsernameOrPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {t('password')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotUsername(usernameOrPhone);
                    setShowForgotModal(true);
                  }}
                  className="text-[11px] font-semibold text-gebeya-600 hover:underline cursor-pointer"
                >
                  {t('forgotPasswordLink')}
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`flex-1 transition-all duration-300 ${
                          passStrength.score >= level ? passStrength.color : 'bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    {t(passStrength.labelKey)}
                  </span>
                </div>
              )}
            </div>

            {/* Optional TOTP 2FA input if required */}
            {requires2FA && (
              <div className="p-3.5 rounded-2xl bg-primary/5 border border-primary/20 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-gebeya-600">
                  <ShieldCheck size={16} />
                  <span>{t('totpPromptTitle')}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  {t('totpPromptDesc')}
                </p>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="123456"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-center tracking-[0.4em] font-mono text-lg py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 font-bold focus:outline-hidden focus:border-gebeya-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-sm font-bold rounded-2xl mt-1 justify-center shadow-md shadow-gebeya-600/25 active:scale-98 transition-all flex items-center gap-2"
            >
              {isLoading ? 'Verifying...' : requires2FA ? t('totpVerifyAction') : t('loginAction')}
            </button>
          </form>
        )}

        {/* FORCE PASSWORD CHANGE DIALOG */}
        {isForcedPasswordChange && (
          <form onSubmit={handleForcePasswordSubmit} className="flex flex-col gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Key size={16} className="shrink-0 mt-0.5 text-amber-500" />
              <div>
                <strong>Password Change Required</strong>
                <p className="text-[11px] mt-0.5 text-amber-700/80 dark:text-amber-400/80">
                  You are logging in with a temporary password. Please set a new personal password to continue.
                </p>
              </div>
            </div>

            {forceChangeError && (
              <p className="text-xs text-red-500 font-semibold">{forceChangeError}</p>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 10 characters"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500 font-mono"
              />
              {newPassword.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    {[1, 2, 3, 4].map((l) => (
                      <div
                        key={l}
                        className={`flex-1 transition-all ${
                          newPassStrength.score >= l ? newPassStrength.color : 'bg-transparent'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {t(newPassStrength.labelKey)}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={!newPassStrength.isValid}
              className="btn-primary w-full py-3 rounded-2xl font-bold text-sm"
            >
              Set New Password & Continue
            </button>
          </form>
        )}

        {/* STEP 3: Multi-Branch Selection */}
        {currentStep === 'branches' && (
          <form onSubmit={handleBranchSelect} className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {t('selectBranchTitle')}
              </h2>
              <p className="text-xs text-slate-500 mt-1">{t('selectBranchSubtitle')}</p>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
              {branches.map((b) => (
                <label
                  key={b.id}
                  onClick={() => setSelectedBranchId(b.id)}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    selectedBranchId === b.id
                      ? 'border-gebeya-600 bg-gebeya-50/50 dark:bg-gebeya-950/20 text-gebeya-900 dark:text-gebeya-100'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold">{b.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">Code: {b.code}</span>
                  </div>
                  {selectedBranchId === b.id && (
                    <div className="w-6 h-6 rounded-full bg-gebeya-600 text-white flex items-center justify-center">
                      <Check size={14} />
                    </div>
                  )}
                </label>
              ))}
            </div>

            <button
              type="submit"
              className="btn-primary w-full py-3 rounded-2xl font-bold text-sm shadow-md"
            >
              {t('enterBranchAction')}
            </button>
          </form>
        )}

        {/* Switch to PIN Pad */}
        {onSwitchToPin && currentStep === 'credentials' && !isForcedPasswordChange && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                or
              </span>
              <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            </div>

            <button
              type="button"
              onClick={onSwitchToPin}
              className="btn-secondary w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"
            >
              <KeyRound size={16} className="text-gebeya-600" />
              {t('pinLogin')}
            </button>
          </>
        )}

        {/* Bottom Navigation Links */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              window.location.hash = '#register';
            }}
            className="text-[11px] text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <Store size={13} className="text-emerald-600 dark:text-emerald-400" />
            {language === 'am' ? 'ሱፐርማርኬትዎን ያስመዝግቡ' : 'Register your supermarket'}
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.hash = '#platform';
            }}
            className="text-[11px] text-slate-400 hover:text-emerald-500 transition-colors flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <ShieldAlert size={13} className="text-emerald-500" />
            Platform HQ
          </button>
        </div>
      </div>

      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {t('resetPasswordTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <p className="text-xs text-red-500 font-semibold">{forgotError}</p>
            )}
            {forgotMsg && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{forgotMsg}</p>
            )}

            {forgotStep === 'request' ? (
              <form onSubmit={handleSendResetCode} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">
                  Enter your username or registered phone to receive a 6-digit reset code (10-minute expiry).
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('usernameOrPhone')}
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    placeholder="admin or +251 91 122 3344"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full py-2.5 rounded-xl font-bold text-xs mt-1"
                >
                  {t('sendResetCode')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleExecuteReset} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {t('resetCodeLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-center tracking-[0.4em] font-mono text-base py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold focus:outline-hidden focus:border-gebeya-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    New Password (min 10 chars)
                  </label>
                  <input
                    type="password"
                    required
                    value={resetNewPass}
                    onChange={(e) => setResetNewPass(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:border-gebeya-500 font-mono"
                  />
                  {resetNewPass.length > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 flex gap-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        {[1, 2, 3, 4].map((l) => (
                          <div
                            key={l}
                            className={`flex-1 ${
                              resetPassStrength.score >= l ? resetPassStrength.color : 'bg-transparent'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">
                        {t(resetPassStrength.labelKey)}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!resetPassStrength.isValid}
                  className="btn-primary w-full py-2.5 rounded-xl font-bold text-xs mt-1"
                >
                  {t('resetPasswordAction')}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
