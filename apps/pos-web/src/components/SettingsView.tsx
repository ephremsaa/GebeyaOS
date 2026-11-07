import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  Store,
  Receipt,
  DollarSign,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Key,
  MapPin,
  Phone,
  FileText,
  Percent,
  Coins,
  ShieldCheck,
  Radio,
  Eye,
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { BranchActivationModal } from './settings/BranchActivationModal';

export const SettingsView: React.FC = () => {
  const { t, language, calendar, setCalendar } = useI18n();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'store' | 'receipt' | 'fiscal' | 'sync'>('store');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);
  const [pingStatus, setPingStatus] = useState<'idle' | 'testing' | 'online' | 'offline'>('idle');

  // Active user / branch context
  const branchId = currentUser?.branchId || localStorage.getItem('gebeyaos_branch_id') || '01a19309-1d43-7444-b260-5b2ffac3e40c';
  const userId = currentUser?.id || '';
  const token = localStorage.getItem('gebeyaos_access_token') || sessionStorage.getItem('gebeyaos_token') || localStorage.getItem('gebeyaos_token');

  // Form states
  const [storeInfo, setStoreInfo] = useState({
    name: '',
    code: '',
    tradeName: '',
    tinNumber: '',
    vatNumber: '',
    phone: '',
    address: '',
  });

  const [receiptConfig, setReceiptConfig] = useState({
    headerText: 'እንኳን ደህና መጡ! / Welcome to our Supermarket',
    footerText: 'ዕቃዎች ከተገዙበት ቀን ጀምሮ በ3 ቀናት ውስጥ በደረሰኝ ይመለሳሉ።\nGoods exchangeable within 3 days with receipt.\nThank you for shopping with us!',
    taxInvoiceTitle: 'OFFICIAL CASH SALES INVOICE',
    showCashierName: true,
    showTinVat: true,
  });

  const [fiscalConfig, setFiscalConfig] = useState({
    defaultCurrency: 'ETB',
    vatRate: 0.15,
    withholdingTaxRate: 0.02,
    cashDrawerLimit: 50000,
  });

  const [syncConfig, setSyncConfig] = useState({
    hqUrl: 'http://localhost:4000/api/sync',
    autoSyncIntervalSeconds: 30,
    offlineGracePeriodHours: 72,
  });

  // Track initial state to detect unsaved changes
  const [initialState, setInitialState] = useState<{
    store: any;
    receipt: any;
    fiscal: any;
    sync: any;
  }>({
    store: {},
    receipt: {},
    fiscal: {},
    sync: {},
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setErrorToast(null);

      const headers: Record<string, string> = {
        'x-branch-id': branchId,
        'x-user-id': userId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/system/settings', { headers });
      if (res.ok) {
        const data = await res.json();
        const loadedStore = data.store_info || {};
        const loadedReceipt = data.receipt_config || {};
        const loadedFiscal = data.financial_config || {};
        const loadedSync = data.sync_config || {};

        setStoreInfo((prev) => ({ ...prev, ...loadedStore }));
        setReceiptConfig((prev) => ({ ...prev, ...loadedReceipt }));
        setFiscalConfig((prev) => ({ ...prev, ...loadedFiscal }));
        setSyncConfig((prev) => ({ ...prev, ...loadedSync }));

        setInitialState({
          store: loadedStore,
          receipt: loadedReceipt,
          fiscal: loadedFiscal,
          sync: loadedSync,
        });
      } else {
        setErrorToast('Could not load settings from branch server');
      }
    } catch (err: any) {
      console.error('Failed to load settings', err);
      setErrorToast('Network error loading settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [branchId]);

  // Dirty detection for current tab
  const isDirty = useMemo(() => {
    if (activeTab === 'store') {
      return JSON.stringify(storeInfo) !== JSON.stringify({ ...storeInfo, ...initialState.store });
    }
    if (activeTab === 'receipt') {
      return JSON.stringify(receiptConfig) !== JSON.stringify({ ...receiptConfig, ...initialState.receipt });
    }
    if (activeTab === 'fiscal') {
      return JSON.stringify(fiscalConfig) !== JSON.stringify({ ...fiscalConfig, ...initialState.fiscal });
    }
    if (activeTab === 'sync') {
      return JSON.stringify(syncConfig) !== JSON.stringify({ ...syncConfig, ...initialState.sync });
    }
    return false;
  }, [activeTab, storeInfo, receiptConfig, fiscalConfig, syncConfig, initialState]);

  const handleSave = async (key: string, value: any, label: string) => {
    setSavingKey(key);
    setErrorToast(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-branch-id': branchId,
        'x-user-id': userId,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/system/settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ key, value }),
      });

      if (res.ok) {
        setSuccessToast(`${label} saved successfully.`);
        setTimeout(() => setSuccessToast(null), 3500);

        // Update initial baseline
        setInitialState((prev) => ({
          ...prev,
          [key === 'store_info'
            ? 'store'
            : key === 'receipt_config'
            ? 'receipt'
            : key === 'financial_config'
            ? 'fiscal'
            : 'sync']: value,
        }));
      } else {
        const errorData = await res.json().catch(() => ({}));
        setErrorToast(errorData.message || `Failed to save ${label}. Check server connection.`);
      }
    } catch (err: any) {
      setErrorToast(err?.message || `Error saving ${label}. Check network connection.`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleTestPing = async () => {
    setPingStatus('testing');
    try {
      const res = await fetch(`${syncConfig.hqUrl}/health`, { method: 'GET' }).catch(() => null);
      if (res && res.ok) {
        setPingStatus('online');
      } else {
        setPingStatus('offline');
      }
    } catch {
      setPingStatus('offline');
    }
    setTimeout(() => setPingStatus('idle'), 4000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page p-4 sm:p-6 overflow-hidden select-none">
      {/* ─── 1. Header Toolbar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 shadow-soft">
            <Settings size={22} className="stroke-[2.2]" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-text-main flex items-center gap-2 tracking-tight">
              {t('settings.title')}
            </h1>
            <p className="text-xs text-text-muted">
              {t('settings.subtitle')}
            </p>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2">
          {successToast && (
            <div className="px-3.5 py-1.5 rounded-xl bg-success/15 border border-success/30 text-success text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-soft">
              <CheckCircle2 size={15} />
              <span>{successToast}</span>
            </div>
          )}

          {errorToast && (
            <div className="px-3.5 py-1.5 rounded-xl bg-danger/15 border border-danger/30 text-danger text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200 shadow-soft">
              <AlertTriangle size={15} />
              <span>{errorToast}</span>
            </div>
          )}

          {isDirty && !successToast && !errorToast && (
            <div className="px-3 py-1 rounded-xl bg-warning/15 border border-warning/30 text-warning text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-warning" />
              <span>{t('settings.unsavedChanges')}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── 2. Main Tabbed Layout Card ─── */}
      <div className="flex-1 bg-surface rounded-3xl border border-border-subtle shadow-soft overflow-hidden flex flex-col md:flex-row min-h-0">
        {/* Left Sub-Navigation */}
        <div className="w-full md:w-64 bg-surface-2 p-3 sm:p-4 border-b md:border-b-0 md:border-r border-border-subtle flex flex-row md:flex-col justify-between shrink-0 gap-2">
          <div className="flex flex-row md:flex-col gap-1.5 w-full overflow-x-auto md:overflow-visible">
            {/* Tab 1 */}
            <button
              type="button"
              onClick={() => setActiveTab('store')}
              className={`px-3.5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 transition-all duration-150 text-left cursor-pointer shrink-0 md:shrink md:w-full ${
                activeTab === 'store'
                  ? 'bg-primary text-white shadow-soft font-extrabold'
                  : 'text-text-muted hover:text-text-main hover:bg-surface/80 dark:hover:bg-surface/60'
              }`}
            >
              <Building2 size={17} className={activeTab === 'store' ? 'text-white' : 'text-primary'} />
              <div className="flex flex-col min-w-0">
                <span className="truncate">{t('settings.tabBranch')}</span>
                <span className={`text-[10px] font-normal truncate ${activeTab === 'store' ? 'text-white/80' : 'text-text-dim'}`}>
                  {t('settings.storeBrandNameDesc')}
                </span>
              </div>
            </button>

            {/* Tab 2 */}
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              className={`px-3.5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 transition-all duration-150 text-left cursor-pointer shrink-0 md:shrink md:w-full ${
                activeTab === 'receipt'
                  ? 'bg-primary text-white shadow-soft font-extrabold'
                  : 'text-text-muted hover:text-text-main hover:bg-surface/80 dark:hover:bg-surface/60'
              }`}
            >
              <Receipt size={17} className={activeTab === 'receipt' ? 'text-white' : 'text-primary'} />
              <div className="flex flex-col min-w-0">
                <span className="truncate">{t('settings.tabReceipt')}</span>
                <span className={`text-[10px] font-normal truncate ${activeTab === 'receipt' ? 'text-white/80' : 'text-text-dim'}`}>
                  {t('settings.receiptLayoutDesc')}
                </span>
              </div>
            </button>

            {/* Tab 3 */}
            <button
              type="button"
              onClick={() => setActiveTab('fiscal')}
              className={`px-3.5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 transition-all duration-150 text-left cursor-pointer shrink-0 md:shrink md:w-full ${
                activeTab === 'fiscal'
                  ? 'bg-primary text-white shadow-soft font-extrabold'
                  : 'text-text-muted hover:text-text-main hover:bg-surface/80 dark:hover:bg-surface/60'
              }`}
            >
              <DollarSign size={17} className={activeTab === 'fiscal' ? 'text-white' : 'text-primary'} />
              <div className="flex flex-col min-w-0">
                <span className="truncate">{t('settings.tabFiscal')}</span>
                <span className={`text-[10px] font-normal truncate ${activeTab === 'fiscal' ? 'text-white/80' : 'text-text-dim'}`}>
                  {t('settings.fiscalDesc')}
                </span>
              </div>
            </button>

            {/* Tab 4 */}
            <button
              type="button"
              onClick={() => setActiveTab('sync')}
              className={`px-3.5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3 transition-all duration-150 text-left cursor-pointer shrink-0 md:shrink md:w-full ${
                activeTab === 'sync'
                  ? 'bg-primary text-white shadow-soft font-extrabold'
                  : 'text-text-muted hover:text-text-main hover:bg-surface/80 dark:hover:bg-surface/60'
              }`}
            >
              <RefreshCw size={17} className={activeTab === 'sync' ? 'text-white' : 'text-primary'} />
              <div className="flex flex-col min-w-0">
                <span className="truncate">{t('settings.tabSync')}</span>
                <span className={`text-[10px] font-normal truncate ${activeTab === 'sync' ? 'text-white/80' : 'text-text-dim'}`}>
                  {t('settings.syncDesc')}
                </span>
              </div>
            </button>
          </div>

          {/* Bottom Action: Activation Codes */}
          <div className="hidden md:block pt-3 border-t border-border-subtle mt-auto">
            <button
              type="button"
              onClick={() => setIsActivationModalOpen(true)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface hover:bg-surface-2 text-text-main text-xs font-bold flex items-center justify-between border border-border-subtle transition-colors duration-150 cursor-pointer shadow-soft group"
            >
              <div className="flex items-center gap-2">
                <Key size={15} className="text-primary group-hover:rotate-45 transition-transform" />
                <span>{t('settings.activationCodes')}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary-soft text-primary font-bold">
                LAN
              </span>
            </button>
          </div>
        </div>

        {/* Right Tab Content */}
        <div className="flex-1 p-5 sm:p-7 overflow-y-auto bg-surface">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-text-muted">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-xs font-medium">{t('settings.loadingConfig')}</p>
            </div>
          ) : (
            <>
              {/* ──────── TAB 1: STORE / BRANCH DETAILS ──────── */}
              {activeTab === 'store' && (
                <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
                  <div className="pb-3 border-b border-border-subtle flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-text-main">
                        {t('settings.branchStoreIdent')}
                      </h2>
                      <p className="text-xs text-text-muted mt-0.5">
                        {t('settings.branchStoreIdentDesc')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Store Brand Name */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.storeName')}
                      </label>
                      <input
                        type="text"
                        value={storeInfo.name}
                        onChange={(e) => setStoreInfo({ ...storeInfo, name: e.target.value })}
                        placeholder="e.g. Kerod Supermarket"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                    </div>

                    {/* Branch Code */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5 flex items-center justify-between">
                        <span>{t('settings.branchCode')}</span>
                        <span className="text-[10px] font-normal text-text-dim">{t('settings.assignedByHq')}</span>
                      </label>
                      <input
                        type="text"
                        value={storeInfo.code}
                        onChange={(e) => setStoreInfo({ ...storeInfo, code: e.target.value })}
                        placeholder="e.g. TULU-01"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs uppercase"
                      />
                    </div>

                    {/* Registered Trade Name */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.tradeName')}
                      </label>
                      <input
                        type="text"
                        value={storeInfo.tradeName}
                        onChange={(e) => setStoreInfo({ ...storeInfo, tradeName: e.target.value })}
                        placeholder="e.g. Leka Trading PLC"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                    </div>

                    {/* TIN Number */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5 flex items-center justify-between">
                        <span>{t('settings.tinNumber')}</span>
                        <span className="text-[10px] font-normal text-text-dim">{t('settings.tenDigits')}</span>
                      </label>
                      <input
                        type="text"
                        maxLength={10}
                        value={storeInfo.tinNumber}
                        onChange={(e) => setStoreInfo({ ...storeInfo, tinNumber: e.target.value.replace(/\D/g, '') })}
                        placeholder="e.g. 0082842324"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs tracking-wider"
                      />
                    </div>

                    {/* VAT Number */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.vatNumber')}
                      </label>
                      <input
                        type="text"
                        value={storeInfo.vatNumber}
                        onChange={(e) => setStoreInfo({ ...storeInfo, vatNumber: e.target.value })}
                        placeholder="e.g. 9988776655"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs tracking-wider"
                      />
                    </div>

                    {/* Store Phone */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.phone')}
                      </label>
                      <div className="relative">
                        <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                        <input
                          type="text"
                          value={storeInfo.phone}
                          onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                          placeholder="e.g. 0941515030"
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Physical Address */}
                  <div>
                    <label className="text-xs font-bold text-text-muted block mb-1.5">
                      {t('settings.address')}
                    </label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3.5 top-3 text-text-dim" />
                      <input
                        type="text"
                        value={storeInfo.address}
                        onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                        placeholder="e.g. Tulu Dimtu, Cameroon St, Addis Ababa, Ethiopia"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-semibold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Save Button Row */}
                  <div className="pt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSave('store_info', storeInfo, 'Branch details')}
                      disabled={savingKey === 'store_info'}
                      className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-soft transition-all duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'store_info' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>{t('settings.saving')}</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>{t('settings.saveBranchDetails')}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsActivationModalOpen(true)}
                      className="md:hidden px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main text-xs font-bold flex items-center gap-2 border border-border-subtle transition-colors cursor-pointer"
                    >
                      <Key size={14} className="text-primary" />
                      <span>Activation Codes</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ──────── TAB 2: RECEIPT CUSTOMIZATION + LIVE PREVIEW ──────── */}
              {activeTab === 'receipt' && (
                <div className="max-w-5xl space-y-6 animate-in fade-in duration-200">
                  <div className="pb-3 border-b border-border-subtle">
                    <h2 className="text-lg font-bold text-text-main">
                      {t('settings.thermalReceiptTemplate')}
                    </h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      {t('settings.thermalReceiptDesc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Controls (7 cols) */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* Invoice Title */}
                      <div>
                        <label className="text-xs font-bold text-text-muted block mb-1.5">
                          {t('settings.officialInvoiceTitle')}
                        </label>
                        <input
                          type="text"
                          value={receiptConfig.taxInvoiceTitle}
                          onChange={(e) =>
                            setReceiptConfig({ ...receiptConfig, taxInvoiceTitle: e.target.value })
                          }
                          placeholder="OFFICIAL CASH SALES INVOICE"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                        />
                      </div>

                      {/* Header Greeting */}
                      <div>
                        <label className="text-xs font-bold text-text-muted block mb-1.5">
                          {t('settings.headerGreeting')}
                        </label>
                        <textarea
                          rows={2}
                          value={receiptConfig.headerText}
                          onChange={(e) =>
                            setReceiptConfig({ ...receiptConfig, headerText: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-medium text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs resize-none"
                        />
                      </div>

                      {/* Footer Policy */}
                      <div>
                        <label className="text-xs font-bold text-text-muted block mb-1.5">
                          {t('settings.footerPolicy')}
                        </label>
                        <textarea
                          rows={3}
                          value={receiptConfig.footerText}
                          onChange={(e) =>
                            setReceiptConfig({ ...receiptConfig, footerText: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-medium text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs resize-none"
                        />
                      </div>

                      {/* Checkbox Toggles */}
                      <div className="p-4 rounded-2xl bg-surface-2 border border-border-subtle space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={receiptConfig.showCashierName}
                            onChange={(e) =>
                              setReceiptConfig({ ...receiptConfig, showCashierName: e.target.checked })
                            }
                            className="w-4 h-4 rounded text-primary focus:ring-primary border-border-subtle"
                          />
                          <span className="text-xs font-bold text-text-main">
                            {t('settings.printCashierName')}
                          </span>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={receiptConfig.showTinVat}
                            onChange={(e) =>
                              setReceiptConfig({ ...receiptConfig, showTinVat: e.target.checked })
                            }
                            className="w-4 h-4 rounded text-primary focus:ring-primary border-border-subtle"
                          />
                          <span className="text-xs font-bold text-text-main">
                            {t('settings.printTinVat')}
                          </span>
                        </label>
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleSave('receipt_config', receiptConfig, 'Receipt template')}
                          disabled={savingKey === 'receipt_config'}
                          className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-soft transition-all duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
                        >
                          {savingKey === 'receipt_config' ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save size={16} />
                              <span>{t('settings.saveReceiptLayout')}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Live Preview (5 cols) */}
                    <div className="lg:col-span-5 bg-surface-2 p-4 rounded-3xl border border-border-subtle space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-text-muted px-1">
                        <span className="flex items-center gap-1.5">
                          <Eye size={14} className="text-primary" />
                          <span>{t('settings.liveSlipPreview')}</span>
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft text-primary font-mono">
                          {t('settings.simulated')}
                        </span>
                      </div>

                      {/* Paper Simulation */}
                      <div className="bg-card text-text-main p-4 rounded-2xl border border-border-subtle shadow-soft font-mono text-[11px] leading-relaxed space-y-2 max-h-[460px] overflow-y-auto">
                        <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-border-subtle">
                          <div className="font-extrabold text-sm">{storeInfo.name || 'Gebeya Supermarket'}</div>
                          {storeInfo.tradeName && <div className="text-[10px] text-text-muted">{storeInfo.tradeName}</div>}
                          {storeInfo.address && <div className="text-[10px] text-text-muted">{storeInfo.address}</div>}
                          {storeInfo.phone && <div className="text-[10px] text-text-muted">TEL: {storeInfo.phone}</div>}
                          {receiptConfig.showTinVat && (
                            <div className="text-[10px] text-text-dim">
                              TIN: {storeInfo.tinNumber || '0082842324'} · VAT: {storeInfo.vatNumber || '9988776655'}
                            </div>
                          )}
                          <div className="pt-1 text-[11px] font-bold text-primary">{receiptConfig.taxInvoiceTitle}</div>
                        </div>

                        <div className="text-[10px] space-y-0.5 pb-2 border-b border-dashed border-border-subtle text-text-muted">
                          <div className="flex justify-between">
                            <span>Receipt: REC-20261104-001</span>
                            <span>{new Date().toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Branch: {storeInfo.code || 'TULU-01'}</span>
                            {receiptConfig.showCashierName && <span>Cashier: sahle leka</span>}
                          </div>
                        </div>

                        {/* Dummy Items */}
                        <div className="space-y-1 py-1 border-b border-dashed border-border-subtle text-[11px]">
                          <div className="flex justify-between">
                            <span>1x Fresh Whole Milk 1L</span>
                            <span className="font-bold">120.00 ETB</span>
                          </div>
                          <div className="flex justify-between">
                            <span>2x Banana Cavendish (1.2kg)</span>
                            <span className="font-bold">180.00 ETB</span>
                          </div>
                        </div>

                        {/* Totals */}
                        <div className="space-y-1 py-1 text-xs font-bold">
                          <div className="flex justify-between">
                            <span>TOTAL:</span>
                            <span className="text-sm font-extrabold text-primary">300.00 ETB</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-text-muted font-normal">
                            <span>VAT 15% (Included):</span>
                            <span>39.13 ETB</span>
                          </div>
                        </div>

                        {/* Welcome & Footer */}
                        <div className="pt-2 border-t border-dashed border-border-subtle text-center text-[10px] text-text-muted space-y-1">
                          <div className="font-semibold">{receiptConfig.headerText}</div>
                          <div className="whitespace-pre-line text-[9px] text-text-dim leading-snug">
                            {receiptConfig.footerText}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ──────── TAB 3: FISCAL & CURRENCY PARAMETERS ──────── */}
              {activeTab === 'fiscal' && (
                <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
                  <div className="pb-3 border-b border-border-subtle">
                    <h2 className="text-lg font-bold text-text-main">
                      {t('settings.ethiopianFiscalSettings')}
                    </h2>
                    <p className="text-xs text-text-muted mt-0.5">
                      {t('settings.ethiopianFiscalDesc')}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Currency */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.nationalCurrency')}
                      </label>
                      <input
                        type="text"
                        disabled
                        value="ETB (Ethiopian Birr - ብር)"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2 border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-muted cursor-not-allowed"
                      />
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.nationalCurrencyDesc')}
                      </span>
                    </div>

                    {/* Standard VAT Rate */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5 flex items-center justify-between">
                        <span>{t('settings.vatRateLabel')}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary-soft text-primary font-bold">
                          {(fiscalConfig.vatRate * 100).toFixed(0)}%
                        </span>
                      </label>
                      <div className="relative">
                        <Percent size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="1"
                          value={fiscalConfig.vatRate}
                          onChange={(e) =>
                            setFiscalConfig({ ...fiscalConfig, vatRate: parseFloat(e.target.value) || 0.15 })
                          }
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                        />
                      </div>
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.vatRateDesc')}
                      </span>
                    </div>

                    {/* Withholding Tax */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5 flex items-center justify-between">
                        <span>{t('settings.withholdingTaxLabel')}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary-soft text-primary font-bold">
                          {(fiscalConfig.withholdingTaxRate * 100).toFixed(0)}%
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={fiscalConfig.withholdingTaxRate}
                        onChange={(e) =>
                          setFiscalConfig({
                            ...fiscalConfig,
                            withholdingTaxRate: parseFloat(e.target.value) || 0.02,
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.withholdingTaxDesc')}
                      </span>
                    </div>

                    {/* Safe Drop Alert Limit */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.safeDropAlertLimit')}
                      </label>
                      <div className="relative">
                        <Coins size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
                        <input
                          type="number"
                          min="1000"
                          step="1000"
                          value={fiscalConfig.cashDrawerLimit}
                          onChange={(e) =>
                            setFiscalConfig({
                              ...fiscalConfig,
                              cashDrawerLimit: parseInt(e.target.value) || 50000,
                            })
                          }
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                        />
                      </div>
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.safeDropDesc')}
                      </span>
                    </div>
                  </div>


                    {/* Calendar System Preference */}
                    <div className="sm:col-span-2 p-4 rounded-2xl bg-surface-2 dark:bg-[#162032] border border-border-subtle dark:border-[#334155] space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-bold text-text-main dark:text-[#F8FAFC] block">
                            {t('settings.calendarPreference')}
                          </label>
                          <p className="text-[11px] text-text-muted dark:text-[#94A3B8] mt-0.5">
                            {t('settings.calendarHelp')}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-primary/10 text-primary dark:text-[#10B981] border border-primary/20">
                          {calendar === 'ethiopic' ? t('settings.calendarEthiopian') : t('settings.calendarGregorian')}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <label
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            calendar === 'gregorian'
                              ? 'bg-primary/10 border-primary text-primary dark:text-[#34D399]'
                              : 'bg-input dark:bg-[#162032] border-border-subtle dark:border-[#334155] text-text-muted hover:border-text-dim'
                          }`}
                        >
                          <input
                            type="radio"
                            name="calendarPreference"
                            value="gregorian"
                            checked={calendar === 'gregorian'}
                            onChange={() => setCalendar('gregorian')}
                            className="text-primary focus:ring-primary"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-main dark:text-[#F8FAFC]">
                              {t('settings.calendarGregorian')}
                            </span>
                            <span className="text-[10px] text-text-dim">e.g. Nov 7, 2026 (Africa/Addis_Ababa)</span>
                          </div>
                        </label>

                        <label
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            calendar === 'ethiopic'
                              ? 'bg-primary/10 border-primary text-primary dark:text-[#34D399]'
                              : 'bg-input dark:bg-[#162032] border-border-subtle dark:border-[#334155] text-text-muted hover:border-text-dim'
                          }`}
                        >
                          <input
                            type="radio"
                            name="calendarPreference"
                            value="ethiopic"
                            checked={calendar === 'ethiopic'}
                            onChange={() => setCalendar('ethiopic')}
                            className="text-primary focus:ring-primary"
                          />
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-text-main dark:text-[#F8FAFC]">
                              {t('settings.calendarEthiopian')}
                            </span>
                            <span className="text-[10px] text-text-dim">ለምሳሌ፡ ጥቅምት 28/2019 ዓ.ም (አዲስ አበባ)</span>
                          </div>
                        </label>
                      </div>
                    </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => handleSave('financial_config', fiscalConfig, 'Fiscal parameters')}
                      disabled={savingKey === 'financial_config'}
                      className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-soft transition-all duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'financial_config' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>{t('settings.saveFiscalParams')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* ──────── TAB 4: SYNC & CLOUD HQ ──────── */}
              {activeTab === 'sync' && (
                <div className="max-w-3xl space-y-6 animate-in fade-in duration-200">
                  <div className="pb-3 border-b border-border-subtle flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-text-main">
                        {t('settings.cloudHqConnectivity')}
                      </h2>
                      <p className="text-xs text-text-muted mt-0.5">
                        {t('settings.cloudHqDesc')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestPing}
                      disabled={pingStatus === 'testing'}
                      className="px-3.5 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-text-main border border-border-subtle text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Radio size={14} className={pingStatus === 'testing' ? 'animate-pulse text-warning' : 'text-primary'} />
                      <span>{pingStatus === 'testing' ? t('settings.pingingHq') : t('settings.pingHq')}</span>
                      {pingStatus === 'online' && <span className="w-2 h-2 rounded-full bg-success" />}
                      {pingStatus === 'offline' && <span className="w-2 h-2 rounded-full bg-danger" />}
                    </button>
                  </div>

                  {/* HQ Server URL */}
                  <div>
                    <label className="text-xs font-bold text-text-muted block mb-1.5">
                      {t('settings.centralHqApiUrl')}
                    </label>
                    <input
                      type="text"
                      value={syncConfig.hqUrl}
                      onChange={(e) => setSyncConfig({ ...syncConfig, hqUrl: e.target.value })}
                      placeholder="https://hq.gebeyaos.com/api/sync"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                    />
                    <span className="text-[10px] text-text-dim mt-1 block">
                      {t('settings.centralHqApiUrlDesc')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Auto Sync Interval */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.autoSyncPollingInterval')}
                      </label>
                      <input
                        type="number"
                        min="5"
                        max="600"
                        value={syncConfig.autoSyncIntervalSeconds}
                        onChange={(e) =>
                          setSyncConfig({
                            ...syncConfig,
                            autoSyncIntervalSeconds: parseInt(e.target.value) || 30,
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.autoSyncPollingDesc')}
                      </span>
                    </div>

                    {/* Offline Grace Period */}
                    <div>
                      <label className="text-xs font-bold text-text-muted block mb-1.5">
                        {t('settings.offlineGracePeriod')}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={syncConfig.offlineGracePeriodHours}
                        onChange={(e) =>
                          setSyncConfig({
                            ...syncConfig,
                            offlineGracePeriodHours: parseInt(e.target.value) || 72,
                          })
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-input border border-border-subtle text-xs sm:text-sm font-mono font-bold text-text-main placeholder:text-text-dim focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                      />
                      <span className="text-[10px] text-text-dim mt-1 block">
                        {t('settings.offlineGraceDesc')}
                      </span>
                    </div>
                  </div>

                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => handleSave('sync_config', syncConfig, 'Sync settings')}
                      disabled={savingKey === 'sync_config'}
                      className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-soft transition-all duration-150 active:scale-98 cursor-pointer disabled:opacity-50"
                    >
                      {savingKey === 'sync_config' ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          <span>{t('settings.saveSyncSettings')}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Branch Activation Modal */}
      <BranchActivationModal
        isOpen={isActivationModalOpen}
        onClose={() => setIsActivationModalOpen(false)}
      />
    </div>
  );
};
