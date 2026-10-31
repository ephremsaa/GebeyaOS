import React, { useState, useEffect } from 'react';
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
  Smartphone,
  Shield,
  Key,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { BranchActivationModal } from './settings/BranchActivationModal';

export const SettingsView: React.FC = () => {
  const { language } = useI18n();
  const { hasRole } = useAuth();

  const [activeTab, setActiveTab] = useState<'store' | 'receipt' | 'fiscal' | 'sync'>('store');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);

  // Settings state
  const [storeInfo, setStoreInfo] = useState({
    name: '',
    code: '',
    tradeName: 'Gebeya Retail PLC',
    tinNumber: '',
    vatNumber: '',
    phone: '+251 911 234567',
    address: 'Bole Medhanialem, Addis Ababa, Ethiopia',
  });

  const [receiptConfig, setReceiptConfig] = useState({
    headerText: 'እንኳን ደህና መጡ! / Welcome to Gebeya Supermarket',
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
    hqUrl: 'http://hq.local:4000/api/sync',
    autoSyncIntervalSeconds: 30,
    offlineGracePeriodHours: 72,
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.store_info) setStoreInfo(data.store_info);
        if (data.receipt_config) setReceiptConfig(data.receipt_config);
        if (data.financial_config) setFiscalConfig(data.financial_config);
        if (data.sync_config) setSyncConfig(data.sync_config);
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (key: string, value: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/system/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });

      if (res.ok) {
        setSuccessToast(`Settings for ${key.replace('_', ' ')} updated successfully.`);
        setTimeout(() => setSuccessToast(null), 3000);
      } else {
        alert('Failed to save settings.');
      }
    } catch (err) {
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="text-gebeya-600" size={24} />
            {language === 'am' ? 'የስርዓት እና የቅርንጫፍ ቅንብሮች' : 'System & Branch Settings'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የሱቅ መረጃ፣ የደረሰኝ አቀማመጥ፣ የቫት (VAT) ተመን እና የማመሳሰል ጊዜ'
              : 'Configure branch identification, receipt headers, tax parameters, and sync intervals.'}
          </p>
        </div>

        {successToast && (
          <div className="px-3.5 py-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={15} />
            {successToast}
          </div>
        )}
      </div>

      {/* 2. Main Tabbed Layout */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col md:flex-row">
        {/* Left Vertical Nav */}
        <div className="w-full md:w-56 bg-slate-50 dark:bg-slate-850 p-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 flex flex-row md:flex-col gap-2">
          <button
            onClick={() => setActiveTab('store')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left ${
              activeTab === 'store'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 size={16} />
            {language === 'am' ? 'የቅርንጫፍ መረጃ' : 'Branch Details'}
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left ${
              activeTab === 'receipt'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Receipt size={16} />
            {language === 'am' ? 'የደረሰኝ አቀማመጥ' : 'Receipt Customization'}
          </button>

          <button
            onClick={() => setActiveTab('fiscal')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left ${
              activeTab === 'fiscal'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <DollarSign size={16} />
            {language === 'am' ? 'የቫት እና የገንዘብ ተመን' : 'Fiscal & Currency'}
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2.5 transition text-left ${
              activeTab === 'sync'
                ? 'bg-gebeya-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <RefreshCw size={16} />
            {language === 'am' ? 'የማመሳሰል ክፍተቶች' : 'Sync & Cloud HQ'}
          </button>
        </div>

        {/* Right Active Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* TAB 1: STORE INFO */}
          {activeTab === 'store' && (
            <div className="max-w-2xl space-y-4 animate-in fade-in">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
                Branch & Store Identification
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Store Brand Name
                  </label>
                  <input
                    type="text"
                    value={storeInfo.name}
                    onChange={(e) => setStoreInfo({ ...storeInfo, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Branch Code
                  </label>
                  <input
                    type="text"
                    value={storeInfo.code}
                    onChange={(e) => setStoreInfo({ ...storeInfo, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Registered Trade Name (Legal Entity)
                  </label>
                  <input
                    type="text"
                    value={storeInfo.tradeName}
                    onChange={(e) => setStoreInfo({ ...storeInfo, tradeName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    TIN (Taxpayer Identification No.)
                  </label>
                  <input
                    type="text"
                    value={storeInfo.tinNumber}
                    onChange={(e) => setStoreInfo({ ...storeInfo, tinNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    VAT Registration Number
                  </label>
                  <input
                    type="text"
                    value={storeInfo.vatNumber}
                    onChange={(e) => setStoreInfo({ ...storeInfo, vatNumber: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Store Phone Number
                  </label>
                  <input
                    type="text"
                    value={storeInfo.phone}
                    onChange={(e) => setStoreInfo({ ...storeInfo, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Physical Store Address
                </label>
                <input
                  type="text"
                  value={storeInfo.address}
                  onChange={(e) => setStoreInfo({ ...storeInfo, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                />
              </div>

              <div className="pt-3 flex items-center gap-3">
                <button
                  onClick={() => handleSave('store_info', storeInfo)}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save Branch Details'}
                </button>

                <button
                  type="button"
                  onClick={() => setIsActivationModalOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-2 border border-slate-200 dark:border-slate-700 transition"
                >
                  <Key size={14} className="text-emerald-500" />
                  Branch Activation Codes
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: RECEIPT CONFIG */}
          {activeTab === 'receipt' && (
            <div className="max-w-2xl space-y-4 animate-in fade-in">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
                Thermal POS Receipt Template
              </h2>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Official Invoice Title
                </label>
                <input
                  type="text"
                  value={receiptConfig.taxInvoiceTitle}
                  onChange={(e) =>
                    setReceiptConfig({ ...receiptConfig, taxInvoiceTitle: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Header Welcome Greeting
                </label>
                <textarea
                  rows={2}
                  value={receiptConfig.headerText}
                  onChange={(e) =>
                    setReceiptConfig({ ...receiptConfig, headerText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Footer Policy / Thank You Message
                </label>
                <textarea
                  rows={3}
                  value={receiptConfig.footerText}
                  onChange={(e) =>
                    setReceiptConfig({ ...receiptConfig, footerText: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptConfig.showCashierName}
                    onChange={(e) =>
                      setReceiptConfig({ ...receiptConfig, showCashierName: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                  <span className="text-xs font-bold">Print Cashier Name on Slip</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiptConfig.showTinVat}
                    onChange={(e) =>
                      setReceiptConfig({ ...receiptConfig, showTinVat: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                  <span className="text-xs font-bold">Print Branch TIN & VAT No.</span>
                </label>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => handleSave('receipt_config', receiptConfig)}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save Receipt Layout'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: FISCAL & CURRENCY */}
          {activeTab === 'fiscal' && (
            <div className="max-w-2xl space-y-4 animate-in fade-in">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
                Ethiopian Fiscal & Currency Settings
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Store Currency
                  </label>
                  <input
                    type="text"
                    disabled
                    value={fiscalConfig.defaultCurrency}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Fixed to Ethiopian Birr (ETB)
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Standard VAT Rate
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={fiscalConfig.vatRate}
                      onChange={(e) =>
                        setFiscalConfig({ ...fiscalConfig, vatRate: parseFloat(e.target.value) || 0.15 })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                    />
                    <span className="text-xs font-bold text-slate-500">
                      ({(fiscalConfig.vatRate * 100).toFixed(0)}%)
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Withholding Tax Rate (Suppliers &gt; 10,000 ETB)
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Cash Register Safe Drop Alert Limit (ETB)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    value={fiscalConfig.cashDrawerLimit}
                    onChange={(e) =>
                      setFiscalConfig({
                        ...fiscalConfig,
                        cashDrawerLimit: parseInt(e.target.value) || 50000,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    Prompts cashier to execute a safe drop when drawer cash exceeds this amount.
                  </span>
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => handleSave('financial_config', fiscalConfig)}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save Fiscal Parameters'}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: SYNC & CLOUD HQ */}
          {activeTab === 'sync' && (
            <div className="max-w-2xl space-y-4 animate-in fade-in">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2">
                Sync Intervals & HQ Connectivity
              </h2>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Central Headquarters API URL
                </label>
                <input
                  type="text"
                  value={syncConfig.hqUrl}
                  onChange={(e) => setSyncConfig({ ...syncConfig, hqUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Auto-Sync Polling Interval (Seconds)
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Offline Grace Period (Hours)
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  onClick={() => handleSave('sync_config', syncConfig)}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? 'Saving...' : 'Save Sync Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <BranchActivationModal
        isOpen={isActivationModalOpen}
        onClose={() => setIsActivationModalOpen(false)}
      />
    </div>
  );
};
