import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Package,
  ShoppingCart,
  PlusCircle,
  ClipboardList,
  Truck,
  BarChart3,
  Tag,
  Wifi,
  ShieldCheck,
  RefreshCw,
  Clock,
  ArrowRight,
  DollarSign,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { NavTabId } from './NavigationRail';

interface DashboardViewProps {
  onNavigate: (tab: NavTabId) => void;
  onOpenAddStock?: () => void;
}

interface DashboardMetrics {
  todaySales: {
    grossSales: number;
    netSales: number;
    transactionCount: number;
    cashCollected: number;
    digitalCollected: number;
    taxTotal: number;
  };
  inventorySummary: {
    totalActiveProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringBatchesCount: number;
  };
  syncStatus: {
    pendingOutboxCount: number;
    lastSyncTime: string | null;
    isOnline: boolean;
  };
  cashDrawer: {
    estimatedCashOnHand: number;
    thresholdAlert: boolean;
    maxThreshold: number;
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenAddStock,
}) => {
  const { t, language } = useI18n();
  const { currentUser } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/system/dashboard-summary');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error('Failed to load dashboard summary', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000); // 30s auto-refresh
    return () => clearInterval(interval);
  }, []);

  const branchName = currentUser?.branchName || 'Bole Main Branch';
  const grossSales = metrics?.todaySales.grossSales || 0;
  const txCount = metrics?.todaySales.transactionCount || 0;
  const lowStock = metrics?.inventorySummary.lowStockCount || 0;
  const outOfStock = metrics?.inventorySummary.outOfStockCount || 0;
  const expiring = metrics?.inventorySummary.expiringBatchesCount || 0;
  const pendingSync = metrics?.syncStatus.pendingOutboxCount || 0;
  const cashOnHand = metrics?.cashDrawer.estimatedCashOnHand || 0;
  const digitalSales = metrics?.todaySales.digitalCollected || 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 select-none">
      {/* 1. Offline LAN Status Banner */}
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0 backdrop-blur-xs">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide uppercase">
                {language === 'am' ? 'የቅርንጫፍ LAN አገልጋይ መስመር ላይ ነው' : 'Branch LAN Sovereign Server Online'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-400/30 text-[10px] font-bold text-emerald-100 uppercase">
                Local-First
              </span>
            </div>
            <p className="text-xs text-emerald-100/90 mt-0.5">
              {language === 'am'
                ? `ቅርንጫፍ: ${branchName} • ሙሉ በሙሉ ከመስመር ውጭ ይሰራል`
                : `Active at ${branchName} • Full POS operations protected during internet outages.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <span className="text-xs text-emerald-100 flex items-center gap-1">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Live sync'}
          </span>
          <button
            onClick={fetchSummary}
            className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-semibold transition active:scale-95"
          >
            {language === 'am' ? 'አድስ' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* Today's Sales */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {language === 'am' ? 'የዛሬ ሽያጭ (ጠቅላላ)' : "Today's Gross Sales"}
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {grossSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span className="text-sm font-bold text-gebeya-600">ETB</span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>{txCount} {language === 'am' ? 'ግብይቶች' : 'transactions'}</span>
              <span>•</span>
              <span className="text-emerald-600 font-medium">VAT incl.</span>
            </div>
          </div>
        </div>

        {/* Customer / Transaction Count */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {language === 'am' ? 'የተስተናገዱ ደንበኞች' : 'Customers Served'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {txCount}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span className="text-blue-600 font-medium">Avg ticket:</span>
              <span>
                {txCount > 0 ? (grossSales / txCount).toFixed(0) : '0'} ETB
              </span>
            </div>
          </div>
        </div>

        {/* Inventory Stock Alerts */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {language === 'am' ? 'የቀነሰ ክምችት ማስጠንቀቂያ' : 'Low Stock Alerts'}
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              lowStock > 0 || outOfStock > 0
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {lowStock + outOfStock}
              </span>
              {outOfStock > 0 && (
                <span className="text-xs font-bold text-rose-500">
                  ({outOfStock} {language === 'am' ? 'አልቋል' : 'out of stock'})
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <button
                onClick={() => onNavigate('reorder')}
                className="text-amber-600 dark:text-amber-400 hover:underline font-medium flex items-center gap-1"
              >
                {language === 'am' ? 'ማዘዣዎችን ይመልከቱ' : 'View Reorder Suggestions'} &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Payment Channels (Cash vs Telebirr) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">
              {language === 'am' ? 'የገንዘብ ሳጥን እና ዲጂታል' : 'Cash & Digital Total'}
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Smartphone size={16} />
            </div>
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white flex justify-between">
              <span className="text-xs text-slate-400 font-normal">Cash:</span>
              <span>{cashOnHand.toLocaleString('en-US', { maximumFractionDigits: 0 })} ETB</span>
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white flex justify-between mt-1">
              <span className="text-xs text-slate-400 font-normal">Telebirr/CBE:</span>
              <span className="text-indigo-600">{digitalSales.toLocaleString('en-US', { maximumFractionDigits: 0 })} ETB</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Quick Action Grid (Large Touch Targets) */}
      <div className="mb-6">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
          {language === 'am' ? 'ፈጣን ተግባራት' : 'Quick Actions'}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {/* New Sale */}
          <button
            onClick={() => onNavigate('checkout')}
            className="p-4 rounded-2xl bg-gebeya-600 hover:bg-gebeya-700 text-white flex flex-col items-center justify-center gap-2 shadow-sm transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition">
              <ShoppingCart size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'አዲስ ሽያጭ' : 'New Sale (F1)'}
            </span>
          </button>

          {/* Add Stock */}
          <button
            onClick={() => {
              if (onOpenAddStock) onOpenAddStock();
              else onNavigate('inventory');
            }}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white flex flex-col items-center justify-center gap-2 shadow-xs transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition">
              <PlusCircle size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'ክምችት ጨምር' : 'Add Stock'}
            </span>
          </button>

          {/* Cycle Stocktake */}
          <button
            onClick={() => onNavigate('stocktake')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white flex flex-col items-center justify-center gap-2 shadow-xs transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center group-hover:scale-110 transition">
              <ClipboardList size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'የክምችት ቆጠራ' : 'Stocktake'}
            </span>
          </button>

          {/* Reorder Suggestions */}
          <button
            onClick={() => onNavigate('reorder')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white flex flex-col items-center justify-center gap-2 shadow-xs transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center group-hover:scale-110 transition">
              <Truck size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'የእቃ ማዘዣ' : 'Reorders'}
            </span>
          </button>

          {/* Product Catalog */}
          <button
            onClick={() => onNavigate('catalog')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white flex flex-col items-center justify-center gap-2 shadow-xs transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 flex items-center justify-center group-hover:scale-110 transition">
              <Tag size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'የእቃዎች ዝርዝር' : 'Products & Barcodes'}
            </span>
          </button>

          {/* Daily Reports */}
          <button
            onClick={() => onNavigate('reports')}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white flex flex-col items-center justify-center gap-2 shadow-xs transition active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center group-hover:scale-110 transition">
              <BarChart3 size={20} />
            </div>
            <span className="text-xs font-bold text-center leading-tight">
              {language === 'am' ? 'የቀን ሪፖርት' : 'Daily Reports'}
            </span>
          </button>
        </div>
      </div>

      {/* 4. Operational Insights & Navigation Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* System & Sync Health */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የስርዓት እና ማመሳሰል ሁኔታ' : 'Local System Health'}
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500">Branch Database:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">PostgreSQL 16 (Local LAN)</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500">HQ Sync Outbox:</span>
                <span className={`font-bold ${pendingSync > 0 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                  {pendingSync} records pending
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                <span className="text-slate-500">Active Products:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {metrics?.inventorySummary.totalActiveProducts || 0} SKUs
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('sync')}
            className="mt-4 w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 transition"
          >
            {language === 'am' ? 'የማመሳሰል ሁኔታን ይመልከቱ' : 'View Sync Monitor'}
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Quick Audit & Security Shortcuts */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-sm font-extrabold text-slate-900 dark:text-white block mb-4">
              {language === 'am' ? 'ደህንነት እና አስተዳደር' : 'Management & Security'}
            </span>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => onNavigate('audit')}
                className="w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/60 text-left flex items-center justify-between text-xs transition"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-indigo-500" />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {language === 'am' ? 'የኦዲት መዝገብ' : 'Audit Log Viewer'}
                    </div>
                    <div className="text-[11px] text-slate-400">Track user actions, logins, and overrides</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('backup')}
                className="w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/60 text-left flex items-center justify-between text-xs transition"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw size={16} className="text-emerald-500" />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {language === 'am' ? 'ቅጂ እና መልሶ ማግኛ' : 'Backup & Restore'}
                    </div>
                    <div className="text-[11px] text-slate-400">One-click USB/local JSON backup with SHA-256</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>

              <button
                onClick={() => onNavigate('settings')}
                className="w-full p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800/60 text-left flex items-center justify-between text-xs transition"
              >
                <div className="flex items-center gap-2">
                  <Tag size={16} className="text-amber-500" />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {language === 'am' ? 'የስርዓት ቅንብሮች' : 'System & Branch Settings'}
                    </div>
                    <div className="text-[11px] text-slate-400">Receipt headers, VAT rate, TIN, and policies</div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Hint Card */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-extrabold text-white">
                {language === 'am' ? 'የቁልፍ ሰሌዳ አቋራጮች' : 'Fast POS Shortcuts'}
              </span>
              <kbd className="px-2 py-0.5 rounded-md bg-slate-700 text-[10px] font-mono text-slate-300">
                Ctrl+K
              </kbd>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-xs text-amber-300">Ctrl+K</kbd> anywhere to open the Global Command Palette and jump to any product, action, or screen in 2 keystrokes.
            </p>

            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>New Checkout:</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-700 font-mono text-[11px]">F1</kbd>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Cash Payment:</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-700 font-mono text-[11px]">F2</kbd>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Lock Terminal:</span>
                <kbd className="px-2 py-0.5 rounded bg-slate-700 font-mono text-[11px]">F9</kbd>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700 text-[11px] text-slate-400 flex items-center justify-between">
            <span>GebeyaOS Retail v1.0.0</span>
            <span className="text-emerald-400 font-medium">Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};
