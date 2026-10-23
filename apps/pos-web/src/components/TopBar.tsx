import React, { useState, useRef, useEffect } from 'react';
import {
  Store,
  Globe,
  Moon,
  Sun,
  LogOut,
  Wifi,
  Monitor,
  User,
  ShieldCheck,
  KeyRound,
  Lock,
  RotateCcw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { StatusDot } from './ui/StatusDot';

export const TopBar: React.FC = () => {
  const { language, setLanguage, t, isDarkMode, toggleDarkMode } = useI18n();
  const { currentUser, logout, lockSession, switchCashier, updateUserPassword, updateUserPin } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);

  // PIN change state
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    if (newPass.length < 8) {
      setPassError('New password must be at least 8 characters long.');
      return;
    }
    const res = await updateUserPassword(currentPass, newPass);
    if (res.success) {
      setIsPassModalOpen(false);
      setCurrentPass('');
      setNewPass('');
      setSuccessMsg('Password updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setPassError(res.error || 'Failed to update password');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('PIN must be 4 to 6 digits.');
      return;
    }
    const res = await updateUserPin(newPin);
    if (res.success) {
      setIsPinModalOpen(false);
      setNewPin('');
      setSuccessMsg('Cashier PIN updated successfully.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } else {
      setPinError(res.error || 'Failed to update PIN');
    }
  };

  const cashierName = currentUser?.fullName || 'Bethlehem T.';
  const roleName = currentUser?.role || 'CASHIER';

  return (
    <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0 relative z-30 select-none">
      {/* Brand & Branch */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gebeya-600 flex items-center justify-center text-white shadow-sm shadow-gebeya-600/30 flex-shrink-0">
          <Store size={20} />
        </div>
        <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
          {t('appName')}
        </span>
        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
          <span className="w-2 h-2 rounded-full bg-gebeya-500" />
          <span>{currentUser?.branchName || t('branchName')}</span>
        </div>
      </div>

      {/* Global Success Banner */}
      {successMsg && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 text-xs font-bold animate-in fade-in">
          <CheckCircle2 size={14} />
          {successMsg}
        </div>
      )}

      {/* Cashier & Status Dropdown trigger */}
      <div className="relative" ref={menuRef}>
        <StatusDot
          status="online"
          cashierName={cashierName}
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        />

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute right-0 top-12 w-80 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100 z-50">
            {/* User Profile Card */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gebeya-100 dark:bg-gebeya-950/60 text-gebeya-600 flex items-center justify-center font-bold text-xs">
                    {cashierName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-slate-900 dark:text-white leading-tight">
                      {cashierName}
                    </span>
                    <span className="text-[10px] text-slate-400">@{currentUser?.username || 'user'}</span>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg bg-gebeya-600 text-white shadow-2xs">
                  {roleName}
                </span>
              </div>

              <div className="h-px bg-slate-200/60 dark:bg-slate-700/50 my-0.5" />

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  <Wifi size={13} />
                  {t('online')}
                </span>
                <span className="font-mono text-[11px] text-slate-400">Branch LAN</span>
              </div>
            </div>

            {/* Quick Actions: Switch Cashier / Lock */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  switchCashier();
                }}
                className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all"
              >
                <RotateCcw size={13} className="text-gebeya-600" />
                {t('switchCashier')}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  lockSession();
                }}
                className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all"
              >
                <Lock size={13} className="text-amber-500" />
                {t('lockTerminal')}
              </button>
            </div>

            {/* Change Credentials */}
            <div className="flex flex-col gap-1 border-t border-b border-slate-100 dark:border-slate-800 py-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsPassModalOpen(true);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <Lock size={14} className="text-slate-400" />
                {t('changePassword')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setIsPinModalOpen(true);
                }}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
              >
                <KeyRound size={14} className="text-slate-400" />
                {t('changePin')}
              </button>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center justify-between px-2 py-1 text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <Globe size={14} />
                {t('language')}
              </span>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setLanguage('en')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                    language === 'en'
                      ? 'bg-white dark:bg-slate-700 text-gebeya-600 dark:text-gebeya-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  EN
                </button>
                <button
                  onClick={() => setLanguage('am')}
                  className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${
                    language === 'am'
                      ? 'bg-white dark:bg-slate-700 text-gebeya-600 dark:text-gebeya-400 shadow-xs'
                      : 'text-slate-500'
                  }`}
                >
                  አማ
                </button>
              </div>
            </div>

            {/* Theme Toggle */}
            <div className="flex items-center justify-between px-2 py-1 text-xs">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                {t('theme')}
              </span>
              <button
                onClick={toggleDarkMode}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-all border border-slate-200 dark:border-slate-700"
              >
                {isDarkMode ? t('darkMode') : t('lightMode')}
              </button>
            </div>

            <div className="h-px bg-slate-100 dark:bg-slate-800 my-0.5" />

            {/* Logout */}
            <button
              onClick={() => {
                setIsMenuOpen(false);
                logout();
              }}
              className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all text-left"
            >
              <LogOut size={14} />
              {t('logout')}
            </button>
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {isPassModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsPassModalOpen(false)}
        >
          <div className="modal-content max-w-sm">
            <h2 className="modal-title">{t('changePassword')}</h2>
            {passError && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl border border-red-200 mb-3">
                {passError}
              </div>
            )}
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <div>
                <label className="field-label">{t('currentPassword')}</label>
                <input
                  type="password"
                  required
                  className="field-input mt-1"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">{t('newPassword')} (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="field-input mt-1"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsPassModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {t('saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {isPinModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsPinModalOpen(false)}
        >
          <div className="modal-content max-w-xs">
            <h2 className="modal-title">{t('changePin')}</h2>
            {pinError && (
              <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl border border-red-200 mb-3">
                {pinError}
              </div>
            )}
            <form onSubmit={handleChangePin} className="flex flex-col gap-3">
              <div>
                <label className="field-label">{t('newPin')} (4-6 digits)</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  className="field-input mt-1 text-center font-mono tracking-widest text-xl font-bold"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsPinModalOpen(false)}
                >
                  {t('cancel')}
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {t('saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
