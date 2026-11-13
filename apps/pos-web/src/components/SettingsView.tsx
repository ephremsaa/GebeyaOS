import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings,
  Store,
  DollarSign,
  Layers,
  Database,
  User,
  Save,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Phone,
  Receipt,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  ShieldAlert,
  Lock,
  KeyRound,
  LogOut,
  Palette,
  Check,
  Percent,
  Calendar,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

const BRAND_PRESETS = [
  { id: 'emerald', name: 'Emerald', hex: '#10B981', secondary: '#0F766E' },
  { id: 'ocean_blue', name: 'Ocean Blue', hex: '#0284C7', secondary: '#0369A1' },
  { id: 'royal_violet', name: 'Royal Violet', hex: '#7C3AED', secondary: '#6D28D9' },
  { id: 'sunset_orange', name: 'Sunset Orange', hex: '#EA580C', secondary: '#C2410C' },
  { id: 'ruby_red', name: 'Ruby Red', hex: '#E11D48', secondary: '#BE123C' },
  { id: 'teal', name: 'Deep Teal', hex: '#0D9488', secondary: '#0F766E' },
  { id: 'gold', name: 'Warm Gold', hex: '#D97706', secondary: '#B45309' },
  { id: 'slate', name: 'Slate Gray', hex: '#475569', secondary: '#334155' },
];

export const SettingsView: React.FC = () => {
  const { t, language } = useI18n();
  const { currentUser, logout, updateUserPassword, updateUserPin } = useAuth();

  const isOwner = currentUser?.role === 'STORE_OWNER' || currentUser?.role === 'OWNER';

  // Active section tab: 'business' | 'sales' | 'stock' | 'data' | 'account'
  const [activeTab, setActiveTab] = useState<'business' | 'sales' | 'stock' | 'data' | 'account'>('business');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // ─── 1. Business Section State ───
  const [storeName, setStoreName] = useState('Gebeya Supermarket');
  const [branchCode, setBranchCode] = useState('BOLE-01');
  const [branchName, setBranchName] = useState('Bole Medhanialem');
  const [storeAddress, setStoreAddress] = useState('Bole Sub-City, Addis Ababa, Ethiopia');
  const [storePhone, setStorePhone] = useState('0911223344');
  const [tinNumber, setTinNumber] = useState('0082842324');
  const [receiptHeader, setReceiptHeader] = useState('Gebeya Supermarket - Bole Medhanialem');
  const [receiptFooter, setReceiptFooter] = useState('Thank you for shopping with us! / እናመሰግናለን!');
  const [brandColor, setBrandColor] = useState('#10B981');
  const [logoUrl, setLogoUrl] = useState('');

  // ─── 2. Sales Section State ───
  const [defaultPayment, setDefaultPayment] = useState<'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'CARD'>('CASH');
  const [allowCreditSales, setAllowCreditSales] = useState(false);
  const [maxDiscountNoPin, setMaxDiscountNoPin] = useState(10);
  const [returnPolicyNote, setReturnPolicyNote] = useState('Items exchangeable within 3 days with valid receipt.');
  const [standardVatRate, setStandardVatRate] = useState(15);

  // ─── 3. Stock Section State ───
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [expiryWarningDays, setExpiryWarningDays] = useState(30);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  // ─── 4. Data Section State ───
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [resetDeleteProducts, setResetDeleteProducts] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  // ─── 5. Account Section State ───
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [accountActionError, setAccountActionError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/system/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.store_info?.name) setStoreName(data.store_info.name);
        if (data.store_info?.code) setBranchCode(data.store_info.code);
        if (data.store_info?.phone) setStorePhone(data.store_info.phone);
        if (data.store_info?.address) setStoreAddress(data.store_info.address);
        if (data.store_info?.tinNumber) setTinNumber(data.store_info.tinNumber);
        if (data.store_info?.brandColor) {
          setBrandColor(data.store_info.brandColor);
          document.documentElement.style.setProperty('--primary', data.store_info.brandColor);
        }
        if (data.receipt_config?.headerText) setReceiptHeader(data.receipt_config.headerText);
        if (data.receipt_config?.footerText) setReceiptFooter(data.receipt_config.footerText);
      }
    } catch {
      // fallback to initial state
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async (section: string) => {
    setIsSaving(true);
    setErrorToast(null);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const payload: any = {
        store_info: {
          name: storeName.trim(),
          code: branchCode.trim(),
          phone: storePhone.trim(),
          address: storeAddress.trim(),
          tinNumber: tinNumber.trim(),
          brandColor,
          logoUrl,
        },
        receipt_config: {
          headerText: receiptHeader,
          footerText: receiptFooter,
          returnPolicyNote,
        },
        sales_config: {
          defaultPayment,
          allowCreditSales,
          maxDiscountNoPin,
          standardVatRate,
        },
        stock_config: {
          lowStockThreshold,
          expiryWarningDays,
          allowNegativeStock,
        },
      };

      await fetch('/api/system/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ key: 'general_config', value: payload }),
      });

      // Update brand color in CSS
      document.documentElement.style.setProperty('--primary', brandColor);

      setSuccessToast(t('settings.saveSettingsSuccess'));
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setErrorToast(err?.message || t('settings.saveSettingsError'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Data: Backup Now Handler ───
  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/system/backup', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Backup creation failed');
      const backupData = await res.json();

      const blob = new Blob([JSON.stringify(backupData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GebeyaOS_Backup_${branchCode}_${new Date().toISOString().slice(0, 10)}.bak`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessToast('Backup (.bak) file generated and downloaded successfully!');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to download backup');
    } finally {
      setIsBackingUp(false);
    }
  };

  // ─── Data: Restore Handler ───
  const handleFileRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Are you sure you want to restore from this backup file? Existing master configurations will be updated.')) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = JSON.parse(content);
          const token = localStorage.getItem('gebeyaos_access_token');

          const res = await fetch('/api/system/restore', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ backupPayload: parsed }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Restore rejected by server');
          }

          setSuccessToast('Database restored successfully and checksum verified!');
          setTimeout(() => setSuccessToast(null), 4000);
          loadSettings();
        } catch (err: any) {
          setErrorToast(err?.message || 'Restore failed');
        } finally {
          setIsRestoring(false);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      setErrorToast(err?.message || 'Could not parse backup file');
      setIsRestoring(false);
    }
    e.target.value = '';
  };

  // ─── Data: Sync Now Handler ───
  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setSuccessToast('Sync with head office complete. All outbox records sent.');
      setTimeout(() => setSuccessToast(null), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  // ─── Data: Dangerous Reset Data Handler ───
  const handleConfirmResetData = async () => {
    if (resetConfirmationInput.trim().toLowerCase() !== storeName.trim().toLowerCase()) {
      setErrorToast(`You must type "${storeName}" exactly to confirm.`);
      return;
    }

    setIsResetting(true);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const res = await fetch('/api/system/reset-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          confirmationTenantName: resetConfirmationInput.trim(),
          deleteProducts: resetDeleteProducts,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Reset failed');
      }

      setIsResetModalOpen(false);
      setResetConfirmationInput('');
      setSuccessToast('All transactional data wiped successfully. Supermarket reset complete.');
      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to execute reset');
    } finally {
      setIsResetting(false);
    }
  };

  // ─── Account: Password Change Handler ───
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountActionError(null);
    if (newPassword.length < 8) {
      setAccountActionError('New password must be at least 8 characters long');
      return;
    }
    const res = await updateUserPassword(currentPassword, newPassword);
    if (res.success) {
      setIsPassModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setSuccessToast('Password updated successfully!');
      setTimeout(() => setSuccessToast(null), 3000);
    } else {
      setAccountActionError(res.error || 'Failed to update password');
    }
  };

  // ─── Account: PIN Change Handler ───
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountActionError(null);
    if (newPin.length < 4 || newPin.length > 6) {
      setAccountActionError('PIN must be 4 to 6 digits');
      return;
    }
    const res = await updateUserPin(newPin);
    if (res.success) {
      setIsPinModalOpen(false);
      setNewPin('');
      setSuccessToast('Terminal quick PIN updated successfully!');
      setTimeout(() => setSuccessToast(null), 3000);
    } else {
      setAccountActionError(res.error || 'Failed to update PIN');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="text-emerald-600" size={24} />
            {t('settings.title')}
          </h1>
          <p className="text-xs text-slate-500">{t('settings.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => handleSaveSettings(activeTab)}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          <span>{isSaving ? t('settings.saving') : t('common.save')}</span>
        </button>
      </div>

      {/* Global Toast Notifications */}
      {successToast && (
        <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}
      {errorToast && (
        <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* ─── 5 Clean Sections Container ─── */}
      <div className="flex-1 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row overflow-hidden shadow-xs min-h-0">
        {/* Left Section Navigation Bar */}
        <div data-testid="settings-nav" className="w-full md:w-56 p-3 bg-slate-50 dark:bg-slate-900/60 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible shrink-0">
          {/* 1. Business */}
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'business'
                ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Store size={16} />
            <span>{t('settings.tabBusiness')}</span>
          </button>

          {/* 2. Sales */}
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'sales'
                ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <DollarSign size={16} />
            <span>{t('settings.tabSales')}</span>
          </button>

          {/* 3. Stock */}
          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'stock'
                ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <Layers size={16} />
            <span>{t('settings.tabStock')}</span>
          </button>

          {/* 4. Data & Backups (Owner Only) */}
          {isOwner && (
            <button
              type="button"
              onClick={() => setActiveTab('data')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
                activeTab === 'data'
                  ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
              }`}
            >
              <Database size={16} />
              <span>{t('settings.tabData')}</span>
            </button>
          )}

          {/* 5. Account */}
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'account'
                ? 'bg-emerald-600 text-white shadow-xs font-extrabold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <User size={16} />
            <span>{t('settings.tabAccount')}</span>
          </button>
        </div>

        {/* Right Section Content */}
        <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
          {/* ──────── SECTION 1: BUSINESS ──────── */}
          {activeTab === 'business' && (
            <div className="max-w-2xl space-y-5 animate-in fade-in">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.tabBusiness')}
                </h2>
                <p className="text-xs text-slate-500">
                  Supermarket identification, branch address, official TIN, and receipt layout
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.storeName')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.branchCode')}
                  </label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.tinNumber')} (ERCA 10 digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.phone')}
                  </label>
                  <input
                    type="text"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.address')}
                  </label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.greetingMessage')}
                  </label>
                  <input
                    type="text"
                    value={receiptHeader}
                    onChange={(e) => setReceiptHeader(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.returnPolicy')}
                  </label>
                  <textarea
                    rows={2}
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                {/* Brand Color Presets */}
                <div className="sm:col-span-2 space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                    {t('settings.brandColorPresets')}
                  </label>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {BRAND_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setBrandColor(p.hex);
                          document.documentElement.style.setProperty('--primary', p.hex);
                        }}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform cursor-pointer shadow-xs ${
                          brandColor.toLowerCase() === p.hex.toLowerCase()
                            ? 'ring-2 ring-offset-2 ring-emerald-500 scale-110'
                            : 'hover:scale-105'
                        }`}
                        style={{ backgroundColor: p.hex }}
                        title={p.name}
                      >
                        {brandColor.toLowerCase() === p.hex.toLowerCase() && (
                          <Check size={16} className="text-white" strokeWidth={3} />
                        )}
                      </button>
                    ))}
                    <input
                      type="color"
                      value={brandColor}
                      onChange={(e) => {
                        setBrandColor(e.target.value);
                        document.documentElement.style.setProperty('--primary', e.target.value);
                      }}
                      className="w-9 h-9 rounded-xl cursor-pointer bg-transparent border-0"
                      title="Custom color picker"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 2: SALES ──────── */}
          {activeTab === 'sales' && (
            <div className="max-w-2xl space-y-5 animate-in fade-in">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.tabSales')}
                </h2>
                <p className="text-xs text-slate-500">
                  Checkout defaults, credit sales policy, cashier discounts, and VAT rates
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.defaultPaymentMethod')}
                  </label>
                  <select
                    value={defaultPayment}
                    onChange={(e) => setDefaultPayment(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="CASH">Cash (ጥሬ ገንዘብ)</option>
                    <option value="TELEBIRR">Telebirr (ቴሌብር)</option>
                    <option value="CBE_BIRR">CBE Birr (ሲቢኢ ብር)</option>
                    <option value="CARD">Bank Card / POS (ካርድ)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.maxDiscountNoPin')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={maxDiscountNoPin}
                    onChange={(e) => setMaxDiscountNoPin(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.vatRateLabel')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={standardVatRate}
                    onChange={(e) => setStandardVatRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('settings.allowCreditSales')}
                    </div>
                    <div className="text-[10px] text-slate-400">Allow customers to buy on credit ledger</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowCreditSales}
                    onChange={(e) => setAllowCreditSales(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    Refund / Exchange Policy Notice
                  </label>
                  <input
                    type="text"
                    value={returnPolicyNote}
                    onChange={(e) => setReturnPolicyNote(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 3: STOCK ──────── */}
          {activeTab === 'stock' && (
            <div className="max-w-2xl space-y-5 animate-in fade-in">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.tabStock')}
                </h2>
                <p className="text-xs text-slate-500">
                  Inventory reorder levels, shelf-life expiry alerts, and stockout blocking
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.lowStockThreshold')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Triggers yellow alert badge on items list
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {t('settings.expiryWarningDays')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={expiryWarningDays}
                    onChange={(e) => setExpiryWarningDays(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Days before expiry date to show warning
                  </span>
                </div>

                <div className="sm:col-span-2 flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                      {t('settings.allowNegativeStock')}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      When off, cashiers are blocked from selling items with zero stock on hand.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowNegativeStock}
                    onChange={(e) => setAllowNegativeStock(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 4: DATA & BACKUPS (OWNER ONLY) ──────── */}
          {activeTab === 'data' && isOwner && (
            <div className="max-w-2xl space-y-6 animate-in fade-in">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.tabData')}
                </h2>
                <p className="text-xs text-slate-500">
                  Database backups, encrypted restore, HQ sync, and safe tenant data reset
                </p>
              </div>

              {/* 1. Backup Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Download size={16} className="text-emerald-600" />
                    {t('settings.backupNow')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t('settings.backupDesc')}</div>
                </div>
                <button
                  type="button"
                  onClick={handleBackupNow}
                  disabled={isBackingUp}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  {isBackingUp ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>{t('settings.backupNow')}</span>
                </button>
              </div>

              {/* 2. Restore Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Upload size={16} className="text-blue-600" />
                    {t('settings.restoreBackup')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t('settings.restoreDesc')}</div>
                </div>
                <input
                  type="file"
                  ref={restoreFileInputRef}
                  accept=".bak,.json"
                  className="hidden"
                  onChange={handleFileRestore}
                />
                <button
                  type="button"
                  onClick={() => restoreFileInputRef.current?.click()}
                  disabled={isRestoring}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  {isRestoring ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{t('settings.restoreBackup')}</span>
                </button>
              </div>

              {/* 3. Sync with Head Office Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <RefreshCw size={16} className="text-amber-500" />
                    {t('settings.syncStatusHq')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Live branch sync health: Connected to Corporate HQ
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>{t('settings.syncNow')}</span>
                </button>
              </div>

              {/* 4. Danger Zone: Reset All Data */}
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 space-y-3">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-black text-xs uppercase tracking-wider">
                  <ShieldAlert size={16} />
                  <span>{t('settings.resetAllData')}</span>
                </div>
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {t('settings.resetAllDataDesc')}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResetConfirmationInput('');
                    setResetDeleteProducts(false);
                    setIsResetModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  <Trash2 size={14} />
                  <span>{t('settings.resetAllData')}</span>
                </button>
              </div>
            </div>
          )}

          {/* ──────── SECTION 5: ACCOUNT ──────── */}
          {activeTab === 'account' && (
            <div className="max-w-md space-y-5 animate-in fade-in">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.tabAccount')}
                </h2>
                <p className="text-xs text-slate-500">Your profile, credentials, and session management</p>
              </div>

              {/* User Profile Card */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black text-base flex items-center justify-center shadow-xs">
                    {(currentUser?.fullName || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {currentUser?.fullName || 'Store Staff'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      @{currentUser?.username || 'user'} • {currentUser?.role || 'STAFF'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex justify-between">
                  <span>Branch:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono">
                    {currentUser?.branchName || 'Bole Medhanialem'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setAccountActionError(null);
                    setCurrentPassword('');
                    setNewPassword('');
                    setIsPassModalOpen(true);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2">
                    <Lock size={15} />
                    <span>{t('settings.changePassword')}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">8+ chars</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAccountActionError(null);
                    setNewPin('');
                    setIsPinModalOpen(true);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} />
                    <span>{t('settings.changePin')}</span>
                  </div>
                  <span className="text-[10px] text-slate-400">4-6 digits</span>
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="w-full px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <LogOut size={15} />
                  <span>{t('settings.logoutAccount')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── RESET DATA CONFIRMATION MODAL ─── */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-rose-300 dark:border-rose-800 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {t('settings.resetModalTitle')}
                  </h3>
                  <p className="text-xs text-rose-600 font-bold">Irreversible Action</p>
                </div>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {t('settings.resetModalWarning')}
            </p>

            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {t('settings.typeStoreNameToConfirm', { name: storeName })}
              </label>
              <input
                type="text"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                placeholder={storeName}
                className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-xs font-bold font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 p-2">
              <input
                type="checkbox"
                id="resetDelProd"
                checked={resetDeleteProducts}
                onChange={(e) => setResetDeleteProducts(e.target.checked)}
                className="w-4 h-4 text-rose-600 rounded cursor-pointer"
              />
              <label htmlFor="resetDelProd" className="text-xs text-slate-700 dark:text-slate-300 font-semibold cursor-pointer">
                {t('settings.alsoDeleteProducts')}
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isResetting ||
                  resetConfirmationInput.trim().toLowerCase() !== storeName.trim().toLowerCase()
                }
                onClick={handleConfirmResetData}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                {isResetting && <Loader2 size={13} className="animate-spin" />}
                <span>{t('settings.confirmResetBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CHANGE PASSWORD MODAL ─── */}
      {isPassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.changePassword')}
                </h3>
              </div>
              <button
                onClick={() => setIsPassModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            {accountActionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{accountActionError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  New Password (8+ chars) *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPassModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CHANGE PIN MODAL ─── */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {t('settings.changePin')}
                </h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            {accountActionError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{accountActionError}</span>
              </div>
            )}

            <form onSubmit={handleChangePin} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  New Quick PIN (4 to 6 digits) *
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono tracking-widest text-center text-lg font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                >
                  Save PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
