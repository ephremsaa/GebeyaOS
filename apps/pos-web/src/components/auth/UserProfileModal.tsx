import React, { useState, useEffect } from 'react';
import {
  User,
  Shield,
  KeyRound,
  Lock,
  Smartphone,
  Globe,
  Moon,
  Sun,
  Laptop,
  Trash2,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../i18n/I18nContext';
import { calculatePasswordStrength } from '../../utils/password-meter';
import { UserSessionInfo } from '@gebeyaos/shared-types';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    updateUserPassword,
    updateUserPin,
    updateUserProfile,
    getUserSessions,
    revokeSession,
    logoutAll,
  } = useAuth();
  const { t, language, setLanguage, isDarkMode, toggleDarkMode } = useI18n();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile');

  // Profile form state
  const [fullName, setFullName] = useState(currentUser?.fullName || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change state
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);
  const [isChangingPass, setIsChangingPass] = useState(false);

  // PIN change state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [isChangingPin, setIsChangingPin] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<UserSessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionActionMsg, setSessionActionMsg] = useState<string | null>(null);

  const newPassStrength = calculatePasswordStrength(newPass);

  useEffect(() => {
    if (isOpen && activeTab === 'sessions') {
      loadSessions();
    }
  }, [isOpen, activeTab]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const list = await getUserSessions();
      setSessions(list);
    } catch {
      // ignore
    } finally {
      setSessionsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setIsSavingProfile(true);

    const res = await updateUserProfile({ fullName, phone });
    setIsSavingProfile(false);
    if (res.success) {
      setProfileSuccess('Profile updated successfully.');
      setTimeout(() => setProfileSuccess(null), 3000);
    } else {
      setProfileError(res.error || 'Failed to update profile.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (newPass !== confirmPass) {
      setPassError('New passwords do not match.');
      return;
    }
    if (!newPassStrength.isValid) {
      setPassError('Password must be at least 10 characters and cannot be a common password.');
      return;
    }

    setIsChangingPass(true);
    const res = await updateUserPassword(currentPass, newPass);
    setIsChangingPass(false);

    if (res.success) {
      setPassSuccess('Password changed successfully.');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => setPassSuccess(null), 3000);
    } else {
      setPassError(res.error || 'Failed to update password.');
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (newPin !== confirmPin) {
      setPinError('PINs do not match.');
      return;
    }
    if (newPin.length < 4 || newPin.length > 6) {
      setPinError('PIN must be 4 to 6 numeric digits.');
      return;
    }

    setIsChangingPin(true);
    const res = await updateUserPin(newPin);
    setIsChangingPin(false);

    if (res.success) {
      setPinSuccess('Cashier PIN updated successfully.');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => setPinSuccess(null), 3000);
    } else {
      setPinError(res.error || 'Failed to update PIN.');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    const res = await revokeSession(sessionId);
    if (res.success) {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setSessionActionMsg('Session revoked.');
      setTimeout(() => setSessionActionMsg(null), 2500);
    }
  };

  const handleLogoutAll = async () => {
    if (window.confirm('Are you sure you want to sign out from all other devices?')) {
      const res = await logoutAll();
      if (res.success) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
      <div className="w-full max-w-lg bg-surface border border-border-subtle rounded-3xl shadow-modal overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary flex items-center justify-center">
              <User size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">{t('profileModalTitle')}</h2>
              <p className="text-[11px] text-text-muted">@{currentUser?.username || 'user'}</p>
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

        {/* Tab Switcher */}
        <div className="flex border-b border-border-subtle px-6 bg-surface-2/40">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-main'
            }`}
          >
            Profile & Preferences
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'security'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-main'
            }`}
          >
            Password & PIN
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'sessions'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-main'
            }`}
          >
            {t('activeSessionsTitle')}
          </button>
        </div>

        {/* Body content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* TAB 1: Profile & Preferences */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="flex flex-col gap-4">
              {profileSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 size={15} />
                  <span>{profileSuccess}</span>
                </div>
              )}
              {profileError && (
                <div className="p-3 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} />
                  <span>{profileError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-xs p-3 rounded-2xl bg-surface-2 border border-border-subtle">
                <div>
                  <span className="text-text-muted">Supermarket:</span>
                  <p className="font-semibold text-text-main">{currentUser?.tenantName || ''}</p>
                </div>
                <div>
                  <span className="text-text-muted">Branch:</span>
                  <p className="font-semibold text-text-main">{currentUser?.branchName || 'Bole'}</p>
                </div>
                <div>
                  <span className="text-text-muted">Role:</span>
                  <p className="font-semibold text-primary">{currentUser?.role}</p>
                </div>
                <div>
                  <span className="text-text-muted">Username:</span>
                  <p className="font-mono text-text-main">@{currentUser?.username}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden focus:border-primary text-text-main"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-main mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+251 91 122 3344"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden focus:border-primary text-text-main font-mono"
                />
              </div>

              {/* Language & Theme switches */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
                    <Globe size={15} className="text-primary" />
                    <span>Language</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`px-2 py-0.5 text-xs font-bold rounded-lg cursor-pointer ${
                        language === 'en' ? 'bg-primary text-white' : 'text-text-muted'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setLanguage('am')}
                      className={`px-2 py-0.5 text-xs font-bold rounded-lg cursor-pointer ${
                        language === 'am' ? 'bg-primary text-white' : 'text-text-muted'
                      }`}
                    >
                      አማ
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-text-main">
                    {isDarkMode ? <Moon size={15} className="text-primary" /> : <Sun size={15} className="text-warning" />}
                    <span>Theme</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-surface border border-border-subtle text-text-main hover:bg-border-subtle cursor-pointer"
                  >
                    {isDarkMode ? 'Dark' : 'Light'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="btn-primary py-2.5 rounded-xl text-xs font-bold mt-2"
              >
                {isSavingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {/* TAB 2: Security (Password + PIN) */}
          {activeTab === 'security' && (
            <div className="flex flex-col gap-6">
              {/* Password Form */}
              <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-text-main">
                  <Lock size={15} className="text-primary" />
                  <span>Change Password</span>
                </div>

                {passSuccess && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{passSuccess}</p>
                )}
                {passError && (
                  <p className="text-xs text-red-500 font-semibold">{passError}</p>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-text-muted mb-1">Current Password</label>
                  <input
                    type="password"
                    required
                    value={currentPass}
                    onChange={(e) => setCurrentPass(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-muted mb-1">
                    New Password (min 10 chars)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden font-mono"
                  />
                  {newPass.length > 0 && (
                    <div className="mt-1 flex items-center gap-2">
                      <div className="flex-1 flex gap-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                        {[1, 2, 3, 4].map((l) => (
                          <div
                            key={l}
                            className={`flex-1 ${
                              newPassStrength.score >= l ? newPassStrength.color : 'bg-transparent'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-text-muted">
                        {t(newPassStrength.labelKey)}
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-muted mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isChangingPass || !newPassStrength.isValid}
                  className="btn-primary py-2 rounded-xl text-xs font-bold self-start mt-1"
                >
                  {isChangingPass ? 'Updating...' : 'Update Password'}
                </button>
              </form>

              <div className="h-px bg-border-subtle" />

              {/* PIN Form */}
              <form onSubmit={handleChangePin} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-text-main">
                  <KeyRound size={15} className="text-primary" />
                  <span>Change Cashier POS PIN (4-6 Digits)</span>
                </div>

                {pinSuccess && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">{pinSuccess}</p>
                )}
                {pinError && (
                  <p className="text-xs text-red-500 font-semibold">{pinError}</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">New PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      placeholder="••••"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center tracking-widest px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">Confirm PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      required
                      placeholder="••••"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full text-center tracking-widest px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs focus:outline-hidden font-mono font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isChangingPin || newPin.length < 4}
                  className="btn-secondary py-2 rounded-xl text-xs font-bold self-start mt-1"
                >
                  {isChangingPin ? 'Updating...' : 'Update Cashier PIN'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: Active Sessions List */}
          {activeTab === 'sessions' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-text-main">{t('activeSessionsTitle')}</h3>
                  <p className="text-[11px] text-text-muted">
                    Manage active sign-in sessions for your account across terminals and browsers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogoutAll}
                  className="px-2.5 py-1 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>{t('revokeAllSessionsAction')}</span>
                </button>
              </div>

              {sessionActionMsg && (
                <div className="p-2.5 rounded-xl bg-primary-soft text-primary text-xs font-semibold">
                  {sessionActionMsg}
                </div>
              )}

              {sessionsLoading ? (
                <div className="p-6 text-center text-xs text-text-muted">Loading active sessions...</div>
              ) : sessions.length === 0 ? (
                <div className="p-4 rounded-2xl bg-surface-2 border border-border-subtle text-xs text-text-muted text-center">
                  1 Active LAN Session (Current device)
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className="p-3 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-surface border border-border-subtle flex items-center justify-center text-text-muted">
                          <Laptop size={16} />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-main">{sess.device || 'Web Browser'}</span>
                            {sess.isCurrent && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                                Current
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-text-muted font-mono">
                            IP: {sess.ip} • Started {new Date(sess.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      {!sess.isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleRevokeSession(sess.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 cursor-pointer"
                        >
                          {t('revokeSessionAction')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

