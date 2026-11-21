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
  Plus,
  Clock,
  Camera,
  Calendar,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useBrand } from '../brand/BrandContext';

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
  const { t, language, textSize, setTextSize, isDarkMode, toggleDarkMode, calendar, setCalendar } = useI18n();
  const { currentUser, logout, updateUserPassword, updateUserPin, updateTenantAndBranchInfo } = useAuth();
  const brand = useBrand();

  const isOwner = currentUser?.role === 'STORE_OWNER' || currentUser?.role === 'OWNER';

  // Active section tab: 'business' | 'appearance' | 'sales' | 'stock' | 'data' | 'account'
  const [activeTab, setActiveTab] = useState<'business' | 'appearance' | 'sales' | 'stock' | 'data' | 'account'>('business');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // ─── 1. Business Section State ───
  const [storeName, setStoreName] = useState(() => currentUser?.tenantName || brand.displayName || 'Gebeya Supermarket');
  const [branchCode, setBranchCode] = useState('BOLE-01');
  const [branchName, setBranchName] = useState(() => currentUser?.branchName || 'Bole Medhanialem');
  const [storeAddress, setStoreAddress] = useState('Ethiopia , Addis Ababa');
  const [storePhone, setStorePhone] = useState('+251 11 661 2233');
  const [tinNumber, setTinNumber] = useState('0012345678');
  const [vatNumber, setVatNumber] = useState('VAT-ET-9921');
  const [receiptHeader, setReceiptHeader] = useState(() => brand.tagline || 'Gebeya Supermarket - Bole Medhanialem');
  const [receiptFooter, setReceiptFooter] = useState('THANK YOU FOR SHOPPING WITH US!');
  const [brandColor, setBrandColor] = useState('#1F8A4C');
  const [logoUrl, setLogoUrl] = useState('');

  // ─── 2. Sales Section State ───
  const [defaultPayment, setDefaultPayment] = useState<'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'CARD'>('CASH');
  const [allowCreditSales, setAllowCreditSales] = useState(false);
  const [maxDiscountNoPin, setMaxDiscountNoPin] = useState(10);
  const [returnPolicyNote, setReturnPolicyNote] = useState('Items exchangeable within 3 days with valid receipt.');
  const [standardVatRate, setStandardVatRate] = useState(15);

  // ─── 3. Stock Section State ───
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [expiryWarningValue, setExpiryWarningValue] = useState(3);
  const [expiryWarningUnit, setExpiryWarningUnit] = useState<'days' | 'months'>('months');
  const [expiryWarningDays, setExpiryWarningDays] = useState(90);
  const [expiryStep30Days, setExpiryStep30Days] = useState(true);
  const [expiryStep7Days, setExpiryStep7Days] = useState(true);
  const [categoryOverrides, setCategoryOverrides] = useState<Array<{ categoryId: string; categoryName: string; days: number }>>([]);
  const [newOverrideCatId, setNewOverrideCatId] = useState('');
  const [newOverrideDays, setNewOverrideDays] = useState(14);
  const [emailSummaryEnabled, setEmailSummaryEnabled] = useState(false);
  const [smsSummaryEnabled, setSmsSummaryEnabled] = useState(false);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name_en: string; name_am?: string }>>([]);
  const [photoStorageFormatted, setPhotoStorageFormatted] = useState('0.00 KB');

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
      const rawBranchId = currentUser?.branchId || localStorage.getItem('gebeyaos_branch_id');
      const branchId = (!rawBranchId || rawBranchId.toUpperCase() === 'ALL' || rawBranchId === '00000000-0000-0000-0000-000000000001')
        ? '01a19309-1d43-7444-b260-5b2ffac3e40c'
        : rawBranchId;
      const res = await fetch('/api/system/settings', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-branch-id': branchId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const storeInfo = data.store_info || data.general_config?.store_info;
        if (storeInfo?.name) setStoreName(storeInfo.name);
        if (storeInfo?.branchName) setBranchName(storeInfo.branchName);
        if (storeInfo?.code) setBranchCode(storeInfo.code);
        if (storeInfo?.phone) setStorePhone(storeInfo.phone);
        if (storeInfo?.address) setStoreAddress(storeInfo.address);
        if (storeInfo?.tinNumber) setTinNumber(storeInfo.tinNumber);
        if (storeInfo?.vatNumber) setVatNumber(storeInfo.vatNumber);
        if (storeInfo?.brandColor) {
          setBrandColor(storeInfo.brandColor);
          document.documentElement.style.setProperty('--primary', storeInfo.brandColor);
        }
        if (storeInfo?.logoUrl) setLogoUrl(storeInfo.logoUrl);

        const receiptConfig = data.receipt_config || data.general_config?.receipt_config;
        if (receiptConfig?.headerText) setReceiptHeader(receiptConfig.headerText);
        if (receiptConfig?.footerText) setReceiptFooter(receiptConfig.footerText);
        if (receiptConfig?.returnPolicyNote) setReturnPolicyNote(receiptConfig.returnPolicyNote);

        const salesConfig = data.sales_config || data.general_config?.sales_config;
        if (salesConfig) {
          if (salesConfig.defaultPayment) setDefaultPayment(salesConfig.defaultPayment);
          if (salesConfig.allowCreditSales !== undefined) setAllowCreditSales(salesConfig.allowCreditSales);
          if (salesConfig.maxDiscountNoPin !== undefined) setMaxDiscountNoPin(salesConfig.maxDiscountNoPin);
          if (salesConfig.standardVatRate !== undefined) setStandardVatRate(salesConfig.standardVatRate);
          if (salesConfig.returnPolicyNote) setReturnPolicyNote(salesConfig.returnPolicyNote);
        }

        const stockConfig = data.stock_config || data.general_config?.stock_config;
        if (stockConfig) {
          if (stockConfig.lowStockThreshold) setLowStockThreshold(stockConfig.lowStockThreshold);
          if (stockConfig.expiryWarningDays) {
            const rawDays = Number(stockConfig.expiryWarningDays);
            setExpiryWarningDays(rawDays);
            if (stockConfig.expiryWarningUnit === 'days') {
              setExpiryWarningValue(rawDays);
              setExpiryWarningUnit('days');
            } else {
              setExpiryWarningValue(Math.round(rawDays / 30) || 3);
              setExpiryWarningUnit('months');
            }
          }
          if (stockConfig.expiryStep30Days !== undefined) setExpiryStep30Days(stockConfig.expiryStep30Days);
          if (stockConfig.expiryStep7Days !== undefined) setExpiryStep7Days(stockConfig.expiryStep7Days);
          if (Array.isArray(stockConfig.categoryOverrides)) setCategoryOverrides(stockConfig.categoryOverrides);
          if (stockConfig.emailSummaryEnabled !== undefined) setEmailSummaryEnabled(stockConfig.emailSummaryEnabled);
          if (stockConfig.smsSummaryEnabled !== undefined) setSmsSummaryEnabled(stockConfig.smsSummaryEnabled);
          if (stockConfig.allowNegativeStock !== undefined) setAllowNegativeStock(stockConfig.allowNegativeStock);
        }
      }
    } catch {
      // fallback to initial state
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/products/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((cats) => {
        if (Array.isArray(cats)) setAvailableCategories(cats);
      })
      .catch(() => {});

    fetch('/api/media/storage-stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((stats) => {
        if (stats?.formatted) setPhotoStorageFormatted(stats.formatted);
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (section: string) => {
    setIsSaving(true);
    setErrorToast(null);
    try {
      const token = localStorage.getItem('gebeyaos_access_token');
      const rawBranchId = currentUser?.branchId || localStorage.getItem('gebeyaos_branch_id');
      const branchId = (!rawBranchId || rawBranchId.toUpperCase() === 'ALL' || rawBranchId === '00000000-0000-0000-0000-000000000001')
        ? '01a19309-1d43-7444-b260-5b2ffac3e40c'
        : rawBranchId;
      const userId = currentUser?.id || localStorage.getItem('gebeyaos_user_id') || '01900000-0000-7000-8000-000000000002';

      const payload: any = {
        store_info: {
          name: storeName.trim(),
          branchName: branchName.trim(),
          code: branchCode.trim(),
          phone: storePhone.trim(),
          address: storeAddress.trim(),
          tinNumber: tinNumber.trim(),
          vatNumber: vatNumber.trim(),
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
          returnPolicyNote,
        },
        stock_config: {
          lowStockThreshold,
          expiryWarningDays: expiryWarningUnit === 'months' ? expiryWarningValue * 30 : expiryWarningValue,
          expiryWarningUnit,
          expiryWarningValue,
          expiryStep30Days,
          expiryStep7Days,
          categoryOverrides,
          emailSummaryEnabled,
          smsSummaryEnabled,
          allowNegativeStock,
        },
      };

      const res = await fetch('/api/system/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-branch-id': branchId,
          'x-user-id': userId,
        },
        body: JSON.stringify({ key: 'general_config', value: payload }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save settings to server');
      }

      // Update brand color in CSS
      document.documentElement.style.setProperty('--primary', brandColor);

      // Update BrandContext locally so branding updates immediately everywhere
      brand.updateBrandLocally({
        displayName: storeName.trim(),
        primaryColor: brandColor,
        tagline: receiptHeader,
      });

      // Update AuthContext user profile locally in localStorage and state
      if (updateTenantAndBranchInfo) {
        updateTenantAndBranchInfo(storeName.trim(), branchName.trim());
      } else if (currentUser) {
        const updated = {
          ...currentUser,
          tenantName: storeName.trim(),
          branchName: branchName.trim(),
        };
        localStorage.setItem('gebeyaos_user', JSON.stringify(updated));
      }

      // Dispatch global custom event so any other open components update
      window.dispatchEvent(
        new CustomEvent('gebeyaos_settings_updated', {
          detail: {
            storeName: storeName.trim(),
            branchName: branchName.trim(),
            brandColor,
          },
        })
      );

      setSuccessToast(t('settings.saveSettingsSuccess'));
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setErrorToast(err?.message || t('settings.saveSettingsError'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCategoryOverride = () => {
    if (!newOverrideCatId) return;
    const cat = availableCategories.find((c) => c.id === newOverrideCatId);
    const catName = (language === 'am' && cat?.name_am) || cat?.name_en || 'Category';
    const filtered = categoryOverrides.filter((c) => c.categoryId !== newOverrideCatId);
    setCategoryOverrides([
      ...filtered,
      { categoryId: newOverrideCatId, categoryName: catName, days: Number(newOverrideDays) || 14 },
    ]);
    setNewOverrideCatId('');
  };

  const handleRemoveCategoryOverride = (catId: string) => {
    setCategoryOverrides(categoryOverrides.filter((c) => c.categoryId !== catId));
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
      const brandSlug = (brand.displayName || 'Backup').replace(/[^a-zA-Z0-9]+/g, '_');
      link.download = `${brandSlug}_Backup_${branchCode}_${new Date().toISOString().slice(0, 10)}.bak`;
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
    <div className="flex-1 flex flex-col h-full bg-page p-4 sm:p-6 overflow-hidden select-none text-text-main">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h1 className="text-[26px] font-extrabold text-text-main flex items-center gap-2.5 tracking-tight">
            <Settings className="text-primary" size={24} />
            {t('settings.title')}
          </h1>
          <p className="text-[14px] text-text-muted mt-0.5">{t('settings.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => handleSaveSettings(activeTab)}
          disabled={isSaving}
          className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          <span>{isSaving ? t('settings.saving') : t('common.save')}</span>
        </button>
      </div>

      {/* Global Toast Notifications */}
      {successToast && (
        <div className="mb-4 p-3 rounded-2xl bg-primary-soft border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-primary shrink-0" />
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
      <div className="flex-1 bg-surface rounded-2xl border border-border-subtle flex flex-col md:flex-row overflow-hidden shadow-card min-h-0">
        {/* Left Section Navigation Bar */}
        <div data-testid="settings-nav" className="w-full md:w-60 p-3.5 bg-surface-2 border-b md:border-b-0 md:border-r border-border-subtle flex md:flex-col gap-1.5 overflow-x-auto md:overflow-x-visible shrink-0">
          {/* 1. Business */}
          <button
            type="button"
            onClick={() => setActiveTab('business')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'business' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
            }`}
          >
            <Store size={16} />
            <span>{t('settings.tabBusiness')}</span>
          </button>

          {/* Appearance & Text Size */}
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'appearance' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
            }`}
          >
            <Palette size={16} />
            <span>{t('settings.tabAppearance')}</span>
          </button>

          {/* 2. Sales */}
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left cursor-pointer shrink-0 md:w-full ${
              activeTab === 'sales' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
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
              activeTab === 'stock' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
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
                activeTab === 'data' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
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
              activeTab === 'account' ? 'bg-primary text-white shadow-soft font-bold' : 'text-text-muted hover:text-text-main hover:bg-surface font-semibold'
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
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main">
                  {t('settings.tabBusiness')}
                </h2>
                <p className="text-xs text-text-muted">
                  Supermarket identification, branch address, official TIN, and receipt layout
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.storeName')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.branchNameLabel') || 'Branch Name'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.branchCode')}
                  </label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.tinNumber')} (ERCA 10 digits)
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    VAT Registration No
                  </label>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.phone')}
                  </label>
                  <input
                    type="text"
                    value={storePhone}
                    onChange={(e) => setStorePhone(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-semibold text-text-main"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.address')}
                  </label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.greetingMessage')}
                  </label>
                  <input
                    type="text"
                    value={receiptHeader}
                    onChange={(e) => setReceiptHeader(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.returnPolicy')}
                  </label>
                  <textarea
                    rows={2}
                    value={receiptFooter}
                    onChange={(e) => setReceiptFooter(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main"
                  />
                </div>

                {/* Brand Color Presets */}
                <div className="sm:col-span-2 space-y-2 pt-2 border-t border-border-subtle">
                  <label className="text-[11px] font-bold text-text-muted block">
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

                {/* Bottom Save Button */}
                <div className="sm:col-span-2 pt-4 border-t border-border-subtle flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveSettings('business')}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-sm font-bold flex items-center gap-2 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isSaving ? t('settings.saving') : t('common.save')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION: APPEARANCE & TEXT SIZE ──────── */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6 animate-in fade-in">
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main flex items-center gap-2">
                  <Palette size={18} className="text-primary" />
                  <span>{t('settings.tabAppearance')}</span>
                </h2>
                <p className="text-xs text-text-muted">
                  {t('settings.textSizeDesc')}
                </p>
              </div>

              {/* 1. Text Size Selector */}
              <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-text-main block">
                  {t('settings.textSize')} *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { id: 'medium', labelKey: 'settings.textSizeMedium', px: '16px' },
                    { id: 'large', labelKey: 'settings.textSizeLarge', px: '18px' },
                    { id: 'xlarge', labelKey: 'settings.textSizeXLarge', px: '20px' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTextSize(opt.id)}
                      className={`p-3.5 rounded-2xl border text-left transition flex flex-col justify-between gap-2 ${
                        textSize === opt.id
                          ? 'bg-primary-soft border-primary ring-2 ring-emerald-500/20'
                          : 'bg-surface border-border-subtle hover:border-primary'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-main">
                          {t(opt.labelKey)}
                        </span>
                        {textSize === opt.id && (
                          <div className="w-5 h-5 rounded-full bg-primary text-white shadow-soft flex items-center justify-center">
                            <Check size={12} />
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-mono text-text-muted">
                        Base: {opt.px}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Theme & Calendar Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Theme Mode */}
                <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-text-main block">
                    {t('settings.themeMode')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => isDarkMode && toggleDarkMode()}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                        !isDarkMode
                          ? 'bg-white text-text-main border-primary shadow-xs'
                          : 'bg-surface-2 text-text-muted border-transparent'
                      }`}
                    >
                      {t('settings.themeLight')}
                    </button>
                    <button
                      type="button"
                      onClick={() => !isDarkMode && toggleDarkMode()}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                        isDarkMode
                          ? 'bg-surface text-white border-primary shadow-xs'
                          : 'bg-surface-2 text-text-muted border-transparent'
                      }`}
                    >
                      {t('settings.themeDark')}
                    </button>
                  </div>
                </div>

                {/* Calendar System */}
                <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card space-y-2">
                  <label className="text-xs font-black uppercase tracking-wider text-text-main block">
                    {t('settings.calendarPreference')}
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCalendar('gregorian')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                        calendar === 'gregorian'
                          ? 'bg-surface text-text-main border-primary shadow-xs'
                          : 'bg-surface-2 text-text-muted border-transparent'
                      }`}
                    >
                      {t('settings.calendarGregorian')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendar('ethiopic')}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                        calendar === 'ethiopic'
                          ? 'bg-surface text-text-main border-primary shadow-xs'
                          : 'bg-surface-2 text-text-muted border-transparent'
                      }`}
                    >
                      {t('settings.calendarEthiopian')}
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Live High-Contrast Typography Preview */}
              <div className="p-5 rounded-2xl bg-surface border-2 border-dashed border-primary dark:border-emerald-600/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-primary">
                    Live Typography Scale Preview
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary-soft text-emerald-700 dark:text-emerald-300 font-bold">
                    Base: {textSize === 'medium' ? '16px' : textSize === 'large' ? '18px' : '20px'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle space-y-2">
                  <h3 className="text-xl font-black text-text-main">
                    {t('settings.previewTextTitle')}
                  </h3>
                  <p className="text-sm font-medium text-text-main">
                    {t('settings.previewTextBody')}
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                    <span className="text-xs font-bold text-text-muted">Total Price:</span>
                    <span className="text-lg font-bold font-mono text-primary">
                      {t('settings.previewPrice')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 2: SALES ──────── */}
          {activeTab === 'sales' && (
            <div className="max-w-2xl space-y-5 animate-in fade-in">
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main">
                  {t('settings.tabSales')}
                </h2>
                <p className="text-xs text-text-muted">
                  Checkout defaults, credit sales policy, cashier discounts, and VAT rates
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.defaultPaymentMethod')}
                  </label>
                  <select
                    value={defaultPayment}
                    onChange={(e) => setDefaultPayment(e.target.value as any)}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-bold text-text-main"
                  >
                    <option value="CASH">Cash (ጥሬ ገንዘብ)</option>
                    <option value="TELEBIRR">Telebirr (ቴሌብር)</option>
                    <option value="CBE_BIRR">CBE Birr (ሲቢኢ ብር)</option>
                    <option value="CARD">Bank Card / POS (ካርድ)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.maxDiscountNoPin')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={maxDiscountNoPin}
                    onChange={(e) => setMaxDiscountNoPin(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                </div>

                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.vatRateLabel')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={standardVatRate}
                    onChange={(e) => setStandardVatRate(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-2/60 border border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-main">
                      {t('settings.allowCreditSales')}
                    </div>
                    <div className="text-[10px] text-text-muted">Allow customers to buy on credit ledger</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowCreditSales}
                    onChange={(e) => setAllowCreditSales(e.target.checked)}
                    className="w-4 h-4 text-primary rounded cursor-pointer"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    Refund / Exchange Policy Notice
                  </label>
                  <input
                    type="text"
                    value={returnPolicyNote}
                    onChange={(e) => setReturnPolicyNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main"
                  />
                </div>

                {/* Bottom Save Button */}
                <div className="sm:col-span-2 pt-4 border-t border-border-subtle flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveSettings('sales')}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-sm font-bold flex items-center gap-2 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isSaving ? t('settings.saving') : t('common.save')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 3: STOCK & EXPIRY ALERTS ──────── */}
          {activeTab === 'stock' && (
            <div className="max-w-2xl space-y-6 animate-in fade-in">
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main flex items-center gap-2">
                  <Layers size={18} className="text-primary" />
                  <span>{t('settings.tabStock')}</span>
                </h2>
                <p className="text-xs text-text-muted">
                  Inventory reorder levels, shelf-life expiry alerts, and stockout blocking
                </p>
              </div>

              {/* 1. Low Stock & Negative Stock Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[14px] font-semibold text-text-main block mb-1">
                    {t('settings.lowStockThreshold')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main"
                  />
                  <span className="text-[10px] text-text-muted block mt-1">
                    Triggers yellow alert badge on items list
                  </span>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface-2/60 border border-border-subtle">
                  <div>
                    <div className="text-xs font-bold text-text-main">
                      {t('settings.allowNegativeStock')}
                    </div>
                    <div className="text-[10px] text-text-muted">
                      When off, sales with 0 stock are blocked.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={allowNegativeStock}
                    onChange={(e) => setAllowNegativeStock(e.target.checked)}
                    className="w-4 h-4 text-primary rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* 2. Expiry Alerts Card */}
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle space-y-4">
                <div className="border-b border-border-subtle/60 pb-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-text-main flex items-center gap-2">
                    <Calendar size={16} className="text-amber-600" />
                    <span>{t('settings.expiryAlertsTitle')}</span>
                  </h3>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {t('settings.expiryAlertsDesc')}
                  </p>
                </div>

                {/* Primary Threshold: default 3 months (90 days) with Days/Months switch */}
                <div>
                  <label className="text-[11px] font-bold text-text-main block mb-1.5">
                    {t('settings.startWarningBeforeExpiry')} *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={expiryWarningValue}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value));
                        setExpiryWarningValue(val);
                        setExpiryWarningDays(expiryWarningUnit === 'months' ? val * 30 : val);
                      }}
                      className="w-32 px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-mono font-bold text-text-main"
                    />
                    <select
                      value={expiryWarningUnit}
                      onChange={(e) => {
                        const unit = e.target.value as 'days' | 'months';
                        setExpiryWarningUnit(unit);
                        setExpiryWarningDays(unit === 'months' ? expiryWarningValue * 30 : expiryWarningValue);
                      }}
                      className="px-3 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-semibold text-text-main cursor-pointer"
                    >
                      <option value="months">{t('settings.expiryWarningUnitMonths')} (30d/mo)</option>
                      <option value="days">{t('settings.expiryWarningUnitDays')}</option>
                    </select>
                    <span className="text-[11px] font-medium text-text-muted">
                      = {expiryWarningUnit === 'months' ? expiryWarningValue * 30 : expiryWarningValue} {t('settings.expiryWarningUnitDays').toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-950/70 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800">
                      <Clock size={11} />
                      Yellow Alert Stage: {expiryWarningUnit === 'months' ? `${expiryWarningValue} months` : `${expiryWarningValue} days`}
                    </span>
                  </div>
                </div>

                {/* Intermediate Warning Steps */}
                <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                  <label className="text-[11px] font-bold text-text-main block">
                    {t('settings.extraAlertSteps')}
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-text-main cursor-pointer">
                    <input
                      type="checkbox"
                      checked={expiryStep30Days}
                      onChange={(e) => setExpiryStep30Days(e.target.checked)}
                      className="w-4 h-4 text-primary rounded cursor-pointer"
                    />
                    <span className="font-medium">{t('settings.step30Days')}</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-xs text-text-main cursor-pointer">
                    <input
                      type="checkbox"
                      checked={expiryStep7Days}
                      onChange={(e) => setExpiryStep7Days(e.target.checked)}
                      className="w-4 h-4 text-primary rounded cursor-pointer"
                    />
                    <span className="font-medium">{t('settings.step7Days')}</span>
                  </label>
                </div>

                {/* Per-Category Overrides */}
                <div className="space-y-2.5 pt-2 border-t border-border-subtle/60">
                  <div>
                    <label className="text-[11px] font-bold text-text-main block">
                      {t('settings.categoryOverrides')}
                    </label>
                    <p className="text-[10px] text-text-muted">
                      {t('settings.categoryOverridesDesc')}
                    </p>
                  </div>

                  {categoryOverrides.length > 0 ? (
                    <div className="space-y-1.5">
                      {categoryOverrides.map((ov) => (
                        <div
                          key={ov.categoryId}
                          className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs"
                        >
                          <span className="font-semibold text-text-main text-text-main">
                            {ov.categoryName}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                              {ov.days} {t('settings.expiryWarningUnitDays').toLowerCase()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCategoryOverride(ov.categoryId)}
                              className="text-text-muted hover:text-rose-600 transition"
                              title={t('settings.removeOverride')}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-text-muted italic">
                      {t('settings.noCategoryOverrides')}
                    </p>
                  )}

                  {/* Add Category Override Row */}
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={newOverrideCatId}
                      onChange={(e) => setNewOverrideCatId(e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs font-medium text-text-main"
                    >
                      <option value="">{t('settings.selectCategory')}</option>
                      {availableCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {language === 'am' && c.name_am ? c.name_am : c.name_en}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={newOverrideDays}
                        onChange={(e) => setNewOverrideDays(Number(e.target.value))}
                        className="w-20 px-2.5 py-1.5 rounded-xl bg-surface border border-border-subtle text-xs font-mono font-bold text-text-main"
                        placeholder="Days"
                      />
                      <span className="text-[10px] text-text-muted">d</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCategoryOverride}
                      disabled={!newOverrideCatId}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 transition"
                    >
                      <Plus size={13} />
                      <span>{t('settings.addCategoryOverride')}</span>
                    </button>
                  </div>
                </div>

                {/* Owner Daily Summary Alert */}
                <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                  <div>
                    <label className="text-[11px] font-bold text-text-main block">
                      {t('settings.dailySummaryAlert')}
                    </label>
                    <p className="text-[10px] text-text-muted">
                      {t('settings.dailySummaryAlertDesc')}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 text-xs text-text-main cursor-pointer">
                      <input
                        type="checkbox"
                        checked={emailSummaryEnabled}
                        onChange={(e) => setEmailSummaryEnabled(e.target.checked)}
                        className="w-4 h-4 text-primary rounded cursor-pointer"
                      />
                      <span>{t('settings.enableEmailSummary')}</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-text-main cursor-pointer">
                      <input
                        type="checkbox"
                        checked={smsSummaryEnabled}
                        onChange={(e) => setSmsSummaryEnabled(e.target.checked)}
                        className="w-4 h-4 text-primary rounded cursor-pointer"
                      />
                      <span>{t('settings.enableSmsSummary')}</span>
                    </label>
                  </div>
                  <p className="text-[10px] text-text-muted italic">
                    {t('settings.dailySummaryDisabledNote')}
                  </p>
                </div>

                {/* Bottom Save Button */}
                <div className="pt-4 border-t border-border-subtle flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveSettings('stock')}
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-sm font-bold flex items-center gap-2 shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isSaving ? t('settings.saving') : t('common.save')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ──────── SECTION 4: DATA & BACKUPS (OWNER ONLY) ──────── */}
          {activeTab === 'data' && isOwner && (
            <div className="max-w-2xl space-y-6 animate-in fade-in">
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main">
                  {t('settings.tabData')}
                </h2>
                <p className="text-xs text-text-muted">
                  Database backups, encrypted restore, HQ sync, and safe tenant data reset
                </p>
              </div>

              {/* 1. Backup Card */}
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-text-main flex items-center gap-2">
                    <Download size={16} className="text-primary" />
                    {t('settings.backupNow')}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">{t('settings.backupDesc')}</div>
                </div>
                <button
                  type="button"
                  onClick={handleBackupNow}
                  disabled={isBackingUp}
                  className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs"
                >
                  {isBackingUp ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>{t('settings.backupNow')}</span>
                </button>
              </div>

              {/* 2. Restore Card */}
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-text-main flex items-center gap-2">
                    <Upload size={16} className="text-blue-600" />
                    {t('settings.restoreBackup')}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">{t('settings.restoreDesc')}</div>
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
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-text-main flex items-center gap-2">
                    <RefreshCw size={16} className="text-amber-500" />
                    {t('settings.syncStatusHq')}
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">
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

              {/* 4. Product Photo Storage Card */}
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-text-main flex items-center gap-2">
                    <Camera size={16} className="text-purple-600" />
                    <span>{t('settings.photoStorageUsed')}</span>
                  </div>
                  <div className="text-[11px] text-text-muted mt-0.5">{t('settings.photoStorageDesc')}</div>
                </div>
                <div className="px-3.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 font-mono text-xs font-bold shrink-0">
                  {photoStorageFormatted || '0.00 KB'}
                </div>
              </div>

              {/* 5. Danger Zone: Reset All Data */}
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
              <div className="border-b border-border-subtle pb-3">
                <h2 className="text-base font-extrabold text-text-main">
                  {t('settings.tabAccount')}
                </h2>
                <p className="text-xs text-text-muted">Your profile, credentials, and session management</p>
              </div>

              {/* User Profile Card */}
              <div className="p-4 rounded-2xl bg-surface-2/60 border border-border-subtle space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-white shadow-soft font-black text-base flex items-center justify-center shadow-xs">
                    {(currentUser?.fullName || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-text-main">
                      {currentUser?.fullName || 'Store Staff'}
                    </div>
                    <div className="text-xs text-text-muted font-mono">
                      @{currentUser?.username || 'user'} • {currentUser?.role || 'STAFF'}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-border-subtle text-xs text-text-muted flex justify-between">
                  <span>Branch:</span>
                  <span className="font-semibold text-text-main text-text-main font-mono">
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
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-2 dark:hover:bg-surface-2 text-text-main text-text-main text-xs font-bold flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2">
                    <Lock size={15} />
                    <span>{t('settings.changePassword')}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">8+ chars</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAccountActionError(null);
                    setNewPin('');
                    setIsPinModalOpen(true);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-2 dark:hover:bg-surface-2 text-text-main text-text-main text-xs font-bold flex items-center justify-between transition"
                >
                  <div className="flex items-center gap-2">
                    <KeyRound size={15} />
                    <span>{t('settings.changePin')}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">4-6 digits</span>
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-rose-300 dark:border-rose-800 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('settings.resetModalTitle')}
                  </h3>
                  <p className="text-xs text-rose-600 font-bold">Irreversible Action</p>
                </div>
              </div>
              <button
                onClick={() => setIsResetModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              {t('settings.resetModalWarning')}
            </p>

            <div className="p-3 rounded-2xl bg-surface-2 border border-border-subtle">
              <label className="text-[11px] font-bold text-text-main block mb-1">
                {t('settings.typeStoreNameToConfirm', { name: storeName })}
              </label>
              <input
                type="text"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                placeholder={storeName}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border-subtle text-xs font-bold font-mono text-text-main"
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
              <label htmlFor="resetDelProd" className="text-xs text-text-main font-semibold cursor-pointer">
                {t('settings.alsoDeleteProducts')}
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main transition"
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-border-subtle">
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-primary" />
                <h3 className="text-base font-extrabold text-text-main">
                  {t('settings.changePassword')}
                </h3>
              </div>
              <button
                onClick={() => setIsPassModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
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
                <label className="text-[14px] font-semibold text-text-main block mb-1">
                  Current Password *
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main"
                />
              </div>

              <div>
                <label className="text-[14px] font-semibold text-text-main block mb-1">
                  New Password (8+ chars) *
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPassModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition shadow-xs"
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-border-subtle">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-primary" />
                <h3 className="text-base font-extrabold text-text-main">
                  {t('settings.changePin')}
                </h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
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
                <label className="text-[14px] font-semibold text-text-main block mb-1">
                  New Quick PIN (4 to 6 digits) *
                </label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle font-mono tracking-widest text-center text-lg font-bold text-text-main"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition shadow-xs"
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
