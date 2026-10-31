import React, { useState, useRef, useEffect } from 'react';
import {
  Store,
  Globe,
  Moon,
  Sun,
  LogOut,
  Wifi,
  Lock,
  RotateCcw,
  CheckCircle2,
  KeyRound,
  Shield,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { StatusDot, Modal, Button, Input } from './ui';
import { UserProfileModal } from './auth/UserProfileModal';
import { TerminalPairModal } from './auth/TerminalPairModal';
import { Terminal } from 'lucide-react';

export interface TopBarProps {
  onOpenCommandPalette?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
}

export const TopBar: React.FC<TopBarProps> = () => {
  const { language, setLanguage, t, isDarkMode, toggleDarkMode, setUserThemePreference } = useI18n();
  const { currentUser, logout, lockSession, switchCashier, updateUserPassword, updateUserPin } = useAuth();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isTerminalPairModalOpen, setIsTerminalPairModalOpen] = useState(false);
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

  const handleToggleTheme = () => {
    const nextDark = !isDarkMode;
    if (currentUser?.id) {
      setUserThemePreference(currentUser.id, nextDark);
    } else {
      toggleDarkMode();
    }
  };

  const cashierName = currentUser?.fullName || 'Cashier';
  const roleName = currentUser?.role || 'CASHIER';

  return (
    <header className="h-14 px-5 bg-surface border-b border-border-subtle flex items-center justify-between flex-shrink-0 relative z-30 select-none">
      {/* Left: Logo, Wordmark, thin divider, Branch Pill */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-soft flex-shrink-0">
          <Store size={18} strokeWidth={1.75} />
        </div>
        <span className="font-semibold text-lg tracking-tight text-text-main">
          {currentUser?.tenantName || t('appName')}
        </span>
        <div className="h-4 w-px bg-border-subtle mx-1 hidden sm:block" />
        <div className="hidden sm:flex items-center gap-2 text-[13px] font-medium px-3 py-1 rounded-full bg-surface-2 text-text-muted border border-border-subtle">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>{currentUser?.branchName || t('branchName')}</span>
        </div>
      </div>

      {/* Global Success Banner */}
      {successMsg && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-primary-soft text-primary border border-primary/20 text-xs font-semibold animate-in fade-in">
          <CheckCircle2 size={14} strokeWidth={1.75} />
          {successMsg}
        </div>
      )}

      {/* Right: Sync Status Dot, then User Avatar Menu */}
      <div className="flex items-center gap-3">
        {/* Sync Status Dot */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-2 border border-border-subtle text-xs text-text-muted">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-[12px] font-medium">{t('online')}</span>
        </div>

        {/* User Avatar Menu Trigger */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 p-1 pl-2.5 rounded-full bg-surface-2 hover:bg-border-subtle transition-colors duration-fast border border-border-subtle cursor-pointer"
            aria-label="User profile and settings"
          >
            <span className="text-[13px] font-semibold text-text-main max-w-[120px] truncate hidden sm:inline">
              {cashierName}
            </span>
            <div className="w-7 h-7 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xs select-none">
              {cashierName.slice(0, 2).toUpperCase()}
            </div>
          </button>

          {/* User Menu Dropdown */}
          {isMenuOpen && (
            <div className="absolute right-0 top-11 w-76 bg-surface rounded-2xl shadow-modal border border-border-subtle p-3.5 flex flex-col gap-2.5 animate-in fade-in duration-fast z-50">
              {/* Profile Card */}
              <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center font-bold text-xs select-none">
                      {cashierName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-semibold text-xs text-text-main leading-tight">
                        {cashierName}
                      </span>
                      <span className="text-[11px] text-text-muted">@{currentUser?.username || 'user'}</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-soft text-primary">
                    {roleName}
                  </span>
                </div>

                <div className="h-px bg-border-subtle my-0.5" />

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <Wifi size={13} strokeWidth={1.75} />
                    {t('online')}
                  </span>
                  <span className="font-mono text-[11px] text-text-dim">Branch LAN</span>
                </div>
              </div>

              {/* Quick Actions: Switch Cashier / Lock */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsMenuOpen(false);
                    switchCashier();
                  }}
                  leftIcon={<RotateCcw size={13} strokeWidth={1.75} className="text-primary" />}
                >
                  {t('switchCashier')}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setIsMenuOpen(false);
                    lockSession();
                  }}
                  leftIcon={<Lock size={13} strokeWidth={1.75} className="text-warning" />}
                >
                  {t('lockTerminal')}
                </Button>
              </div>

              {/* Profile & Security Options */}
              <div className="flex flex-col gap-1 border-t border-b border-border-subtle py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsProfileModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-main hover:bg-surface-2 text-left transition-colors cursor-pointer"
                >
                  <Shield size={14} strokeWidth={1.75} className="text-primary" />
                  {t('profileModalTitle')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsPassModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface-2 text-left transition-colors cursor-pointer"
                >
                  <Lock size={14} strokeWidth={1.75} className="text-text-dim" />
                  {t('changePassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsPinModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface-2 text-left transition-colors cursor-pointer"
                >
                  <KeyRound size={14} strokeWidth={1.75} className="text-text-dim" />
                  {t('changePin')}
                </button>
                {(currentUser?.role === 'OWNER' || currentUser?.role === 'BRANCH_MANAGER') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsTerminalPairModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:text-text-main hover:bg-surface-2 text-left transition-colors cursor-pointer"
                  >
                    <Terminal size={14} strokeWidth={1.75} className="text-primary" />
                    {t('pairTerminalTitle')}
                  </button>
                )}
              </div>

              {/* Language Switcher */}
              <div className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="flex items-center gap-2 text-text-muted">
                  <Globe size={14} strokeWidth={1.75} />
                  {t('language')}
                </span>
                <div className="flex bg-surface-2 p-0.5 rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      language === 'en'
                        ? 'bg-surface text-primary shadow-soft'
                        : 'text-text-dim hover:text-text-main'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('am')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      language === 'am'
                        ? 'bg-surface text-primary shadow-soft'
                        : 'text-text-dim hover:text-text-main'
                    }`}
                  >
                    አማ
                  </button>
                </div>
              </div>

              {/* Theme Toggle */}
              <div className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="flex items-center gap-2 text-text-muted">
                  {isDarkMode ? <Moon size={14} strokeWidth={1.75} /> : <Sun size={14} strokeWidth={1.75} />}
                  {t('theme')}
                </span>
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface-2 hover:bg-surface text-text-main transition-colors border border-border-subtle cursor-pointer shadow-soft"
                >
                  {isDarkMode ? t('darkMode') : t('lightMode')}
                </button>
              </div>

              <div className="h-px bg-border-subtle my-0.5" />

              {/* Logout */}
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  logout();
                }}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-danger hover:bg-danger-soft transition-colors text-left cursor-pointer"
              >
                <LogOut size={14} strokeWidth={1.75} />
                {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Change Password Modal */}
      {isPassModalOpen && (
        <Modal
          isOpen={isPassModalOpen}
          onClose={() => setIsPassModalOpen(false)}
          title={t('changePassword')}
          maxWidth="sm"
        >
          {passError && (
            <div className="text-xs text-danger bg-danger-soft p-2.5 rounded-lg mb-3">
              {passError}
            </div>
          )}
          <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
            <Input
              label={t('currentPassword')}
              type="password"
              required
              value={currentPass}
              onChange={(e) => setCurrentPass(e.target.value)}
            />
            <Input
              label={`${t('newPassword')} (min 8 chars)`}
              type="password"
              required
              minLength={8}
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setIsPassModalOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" fullWidth>
                {t('saveChanges')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Change PIN Modal */}
      {isPinModalOpen && (
        <Modal
          isOpen={isPinModalOpen}
          onClose={() => setIsPinModalOpen(false)}
          title={t('changePin')}
          maxWidth="sm"
        >
          {pinError && (
            <div className="text-xs text-danger bg-danger-soft p-2.5 rounded-lg mb-3">
              {pinError}
            </div>
          )}
          <form onSubmit={handleChangePin} className="flex flex-col gap-3">
            <Input
              label={`${t('newPin')} (4-6 digits)`}
              type="password"
              required
              maxLength={6}
              className="text-center font-mono tracking-widest text-xl font-bold"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setIsPinModalOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" variant="primary" fullWidth>
                {t('saveChanges')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* User Profile & Security Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />

      {/* Terminal Registration & Pairing Modal */}
      <TerminalPairModal
        isOpen={isTerminalPairModalOpen}
        onClose={() => setIsTerminalPairModalOpen(false)}
      />
    </header>
  );
};
