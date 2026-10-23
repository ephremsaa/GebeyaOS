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
  Search,
  Bell,
  KeyRound,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { StatusDot, Modal, Button, Input } from './ui';

export interface TopBarProps {
  onOpenCommandPalette?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  onOpenCommandPalette,
  onOpenNotifications,
  unreadNotificationsCount = 0,
}) => {
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

  const cashierName = currentUser?.fullName || 'Cashier';
  const roleName = currentUser?.role || 'CASHIER';

  return (
    <header className="h-14 px-4 bg-surface border-b border-border-subtle flex items-center justify-between flex-shrink-0 relative z-30 select-none">
      {/* Brand & Branch Pill */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-xs shadow-primary/25 flex-shrink-0">
          <Store size={18} />
        </div>
        <span className="font-extrabold text-lg tracking-tight text-text-main">
          {t('appName')}
        </span>
        <div className="h-4 w-px bg-border-subtle mx-1 hidden sm:block" />
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-elevated text-text-muted border border-border-subtle">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>{currentUser?.branchName || t('branchName')}</span>
        </div>
      </div>

      {/* Global Success Banner */}
      {successMsg && (
        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-primary/10 text-primary border border-primary/25 text-xs font-bold animate-in fade-in">
          <CheckCircle2 size={14} />
          {successMsg}
        </div>
      )}

      {/* Center: Command Palette Trigger */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-elevated hover:bg-surface border border-border-subtle text-xs text-text-muted transition-colors cursor-pointer"
      >
        <Search size={14} className="text-text-dim" />
        <span className="font-medium">Jump to page, product, or action...</span>
        <kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-strong font-mono text-[10px] font-bold text-text-dim">
          Ctrl+K
        </kbd>
      </button>

      {/* Right Controls: Bell + Cashier Status Menu */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-elevated transition-colors"
          title="Notification Center"
          aria-label="Notification Center"
        >
          <Bell size={18} />
          {unreadNotificationsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-danger text-white font-bold text-[9px] flex items-center justify-center animate-pulse">
              {unreadNotificationsCount}
            </span>
          )}
        </button>

        {/* Cashier & Status Dropdown trigger */}
        <div className="relative" ref={menuRef}>
          <StatusDot
            status="online"
            cashierName={cashierName}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          />

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <div className="absolute right-0 top-12 w-80 bg-surface rounded-2xl shadow-modal border border-border-subtle p-3.5 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100 z-50">
              {/* User Profile Card */}
              <div className="p-3 rounded-xl bg-elevated border border-border-subtle flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs select-none">
                      {cashierName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-text-main leading-tight">
                        {cashierName}
                      </span>
                      <span className="text-[10px] text-text-muted">@{currentUser?.username || 'user'}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-primary text-white">
                    {roleName}
                  </span>
                </div>

                <div className="h-px bg-border-subtle my-0.5" />

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span className="flex items-center gap-1.5 text-primary font-medium">
                    <Wifi size={13} />
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
                  leftIcon={<RotateCcw size={13} className="text-primary" />}
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
                  leftIcon={<Lock size={13} className="text-warning" />}
                >
                  {t('lockTerminal')}
                </Button>
              </div>

              {/* Change Credentials */}
              <div className="flex flex-col gap-1 border-t border-b border-border-subtle py-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsPassModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-main hover:bg-elevated text-left transition-colors cursor-pointer"
                >
                  <Lock size={14} className="text-text-dim" />
                  {t('changePassword')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    setIsPinModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-text-muted hover:text-text-main hover:bg-elevated text-left transition-colors cursor-pointer"
                >
                  <KeyRound size={14} className="text-text-dim" />
                  {t('changePin')}
                </button>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="flex items-center gap-2 text-text-muted">
                  <Globe size={14} />
                  {t('language')}
                </span>
                <div className="flex bg-elevated p-0.5 rounded-lg border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    className={`px-2.5 py-1 text-xs font-bold rounded transition-all cursor-pointer ${
                      language === 'en'
                        ? 'bg-surface text-primary shadow-xs'
                        : 'text-text-dim hover:text-text-main'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('am')}
                    className={`px-2.5 py-1 text-xs font-bold rounded transition-all cursor-pointer ${
                      language === 'am'
                        ? 'bg-surface text-primary shadow-xs'
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
                  {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                  {t('theme')}
                </span>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-elevated hover:bg-surface text-text-main transition-colors border border-border-subtle cursor-pointer"
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
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold text-danger hover:bg-danger/10 transition-colors text-left cursor-pointer"
              >
                <LogOut size={14} />
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
            <div className="text-xs text-danger bg-danger/10 p-2.5 rounded-lg border border-danger/25 mb-3">
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
            <div className="text-xs text-danger bg-danger/10 p-2.5 rounded-lg border border-danger/25 mb-3">
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
    </header>
  );
};
