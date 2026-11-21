import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  ShoppingCart,
  Package,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ExternalLink,
  Plus,
  ShieldCheck,
  Receipt,
  Search,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useBrand } from '../brand/BrandContext';
import { NavTabId } from './NavigationRail';

interface DashboardViewProps {
  onNavigate: (tab: NavTabId, filter?: string) => void;
  onOpenAddStock?: () => void;
}

interface RecentSaleItem {
  id: string;
  receiptNumber: string;
  cashierName: string;
  grandTotal: number;
  paymentStatus: string;
  createdAt: string;
}

interface CategorySaleItem {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
}

interface InventoryAlertItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  type: 'LOW_STOCK' | 'EXPIRING' | 'OUT_OF_STOCK';
  severity: 'WARNING' | 'DANGER';
  currentStock: number;
  uom: string;
  expiryDate?: string | null;
}

interface DayPoint {
  day: string;
  amount: number;
  count: number;
}

interface DashboardData {
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
  recentSales?: RecentSaleItem[];
  weeklyTrend?: {
    thisWeek: DayPoint[];
    lastWeek: DayPoint[];
    growthPercentage: number;
  };
  salesByCategory?: CategorySaleItem[];
  alerts?: InventoryAlertItem[];
  kpis?: {
    salesGrowthPercent: number;
    ordersGrowthPercent: number;
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenAddStock,
}) => {
  const { t, language } = useI18n();
  const { currentUser } = useAuth();
  const brand = useBrand();

  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<{ day: string; thisWeek: number; lastWeek: number; x: number; y: number } | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    return localStorage.getItem('gebeyaos_dashboard_checklist_dismissed') === 'true';
  });

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const effectiveBranch = currentUser?.branchId || 'ALL';
      const headers: Record<string, string> = {
        'x-branch-id': effectiveBranch,
      };
      const token = localStorage.getItem('gebeyaos_access_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`/api/system/dashboard-summary?branchId=${encodeURIComponent(effectiveBranch)}`, {
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const timer = setInterval(fetchDashboardData, 15000); // 15s auto-refresh
    const onSaleCompleted = () => fetchDashboardData();
    window.addEventListener('gebeyaos:sale-completed', onSaleCompleted);
    return () => {
      clearInterval(timer);
      window.removeEventListener('gebeyaos:sale-completed', onSaleCompleted);
    };
  }, [currentUser?.branchId]);

  // Time-of-day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const name = currentUser?.fullName?.split(' ')[0] || (language === 'am' ? 'አስተዳዳሪ' : 'Manager');
    if (hour >= 5 && hour < 12) {
      return language === 'am' ? `እንደምን አደሩ፣ ${name}` : `Good morning, ${name}`;
    } else if (hour >= 12 && hour < 18) {
      return language === 'am' ? `እንደምን ዋሉ፣ ${name}` : `Good afternoon, ${name}`;
    } else {
      return language === 'am' ? `እንደምን አመሹ፣ ${name}` : `Good evening, ${name}`;
    }
  }, [language, currentUser]);

  const grossSales = data?.todaySales.grossSales || 0;
  const orderCount = data?.todaySales.transactionCount || 0;
  const totalProducts = data?.inventorySummary.totalActiveProducts || 0;
  const lowStockCount = data?.inventorySummary.lowStockCount || 0;
  const outOfStockCount = data?.inventorySummary.outOfStockCount || 0;
  const expiringCount = data?.inventorySummary.expiringBatchesCount || 0;
  const recentSales = data?.recentSales || [];
  const alerts = data?.alerts || [];
  const salesByCategory = data?.salesByCategory || [];

  // Default sample weekly data if zero sales to make chart visually rich
  const weekTrend = useMemo(() => {
    const days = language === 'am'
      ? ['ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ', 'እሁድ']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const thisWeekFromApi = data?.weeklyTrend?.thisWeek || [];
    const lastWeekFromApi = data?.weeklyTrend?.lastWeek || [];

    return days.map((dayLabel, idx) => {
      const thisW = thisWeekFromApi[idx]?.amount || 0;
      const lastW = lastWeekFromApi[idx]?.amount || 0;
      return {
        day: dayLabel,
        thisWeek: thisW,
        lastWeek: lastW,
      };
    });
  }, [data, language]);

  // Max value for SVG chart scaling
  const maxChartVal = useMemo(() => {
    const maxVal = Math.max(
      ...weekTrend.map((d) => Math.max(d.thisWeek, d.lastWeek)),
      1000 // baseline min scale
    );
    return Math.ceil(maxVal / 500) * 500;
  }, [weekTrend]);

  // SVG Chart path generators
  const chartWidth = 580;
  const chartHeight = 220;
  const paddingX = 35;
  const paddingY = 25;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const pointsThisWeek = weekTrend.map((pt, i) => {
    const x = paddingX + (i / (weekTrend.length - 1)) * plotWidth;
    const y = chartHeight - paddingY - (pt.thisWeek / maxChartVal) * plotHeight;
    return { x, y, ...pt };
  });

  const pointsLastWeek = weekTrend.map((pt, i) => {
    const x = paddingX + (i / (weekTrend.length - 1)) * plotWidth;
    const y = chartHeight - paddingY - (pt.lastWeek / maxChartVal) * plotHeight;
    return { x, y, ...pt };
  });

  // Smooth bezier curve path
  const makeSmoothPath = (pts: Array<{ x: number; y: number }>) => {
    if (pts.length === 0) return '';
    return pts.reduce((acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x},${pt.y}`;
      const prev = arr[i - 1];
      const cx1 = prev.x + (pt.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (pt.x - prev.x) / 2;
      const cy2 = pt.y;
      return `${acc} C ${cx1},${cy1} ${cx2},${cy2} ${pt.x},${pt.y}`;
    }, '');
  };

  const linePathThisWeek = makeSmoothPath(pointsThisWeek);
  const areaPathThisWeek = pointsThisWeek.length > 0
    ? `${linePathThisWeek} L ${pointsThisWeek[pointsThisWeek.length - 1].x},${chartHeight - paddingY} L ${pointsThisWeek[0].x},${chartHeight - paddingY} Z`
    : '';

  const linePathLastWeek = makeSmoothPath(pointsLastWeek);

  // Category donut chart colors
  const categoryPalette = ['#1F8A4C', '#2563EB', '#7C3AED', '#F59E0B', '#0D9488'];

  // Export report handler
  const handleExportReport = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Gross Sales', `${grossSales} ETB`],
      ['Total Orders', `${orderCount}`],
      ['Catalog Items', `${totalProducts}`],
      ['Low Stock Items', `${lowStockCount}`],
      ['Out of Stock Items', `${outOfStockCount}`],
      ['Expiring Soon (<30d)', `${expiringCount}`],
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GebeyaOS_Dashboard_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isNewSupermarket = totalProducts <= 10 && orderCount === 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-page text-text-main p-5 sm:p-7 select-none space-y-6">
      {/* ─── 1. Header Greeting & Controls ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[26px] sm:text-[28px] font-extrabold text-text-main tracking-tight leading-tight flex items-center gap-2.5">
            <span>{greeting}</span>
          </h1>
          <p className="text-[15px] font-medium text-text-muted mt-1">
            {language === 'am'
              ? 'ዛሬ በሱፐርማርኬትዎ ውስጥ እየተከናወነ ያለው ሁኔታ ይህ ነው።'
              : "Here is what's happening in your supermarket today."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Date Range Selector */}
          <div className="relative inline-flex items-center rounded-xl bg-surface border border-border-subtle shadow-card p-1">
            <button
              type="button"
              onClick={() => setDateRange('today')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition cursor-pointer ${
                dateRange === 'today'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2'
              }`}
            >
              {language === 'am' ? 'ዛሬ' : 'Today'}
            </button>
            <button
              type="button"
              onClick={() => setDateRange('week')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition cursor-pointer ${
                dateRange === 'week'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2'
              }`}
            >
              {language === 'am' ? 'በዚህ ሳምንት' : 'This week'}
            </button>
            <button
              type="button"
              onClick={() => setDateRange('month')}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition cursor-pointer ${
                dateRange === 'month'
                  ? 'bg-primary text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main hover:bg-surface-2'
              }`}
            >
              {language === 'am' ? 'በዚህ ወር' : 'This month'}
            </button>
          </div>

          {/* Export Report Button */}
          <button
            type="button"
            onClick={handleExportReport}
            className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[14px] font-bold shadow-soft flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Download size={16} />
            <span>{language === 'am' ? 'ሪፖርት አውርድ' : 'Export report'}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchDashboardData}
            disabled={loading}
            className="p-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-text-muted hover:text-text-main shadow-card transition active:scale-95 cursor-pointer"
            title={language === 'am' ? 'አድስ' : 'Refresh data'}
          >
            <RefreshCw size={16} className={`text-primary ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── 2. Setup Checklist for New Supermarket (Collapsible / Dismissible) ─── */}
      {isNewSupermarket && !checklistDismissed && (
        <div className="rounded-2xl bg-surface border border-primary/30 shadow-card p-5 relative overflow-hidden transition">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                <h3 className="text-[17px] font-extrabold text-text-main">
                  {language === 'am' ? 'የሱፐርማርኬት ዝግጅት ቅደም ተከተል' : 'Supermarket Setup Checklist'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary text-[11px] font-extrabold">
                  {language === 'am' ? 'አዲስ ሱቅ' : 'Setup in progress'}
                </span>
              </div>
              <p className="text-[14px] font-medium text-text-muted">
                {language === 'am'
                  ? 'የችርቻሮ ሽያጭ ስራ ከመጀመርዎ በፊት የሚከተሉትን ዋና ዋና ቅደም ተከተሎች ያጠናቁ።'
                  : 'Complete these key steps before processing live customer sales.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setChecklistDismissed(true);
                localStorage.setItem('gebeyaos_dashboard_checklist_dismissed', 'true');
              }}
              className="text-[13px] font-bold text-text-muted hover:text-text-main underline self-start md:self-auto cursor-pointer"
            >
              {language === 'am' ? 'ዝጋ' : 'Dismiss'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4 pt-4 border-t border-border-subtle">
            {/* Step 1 */}
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border-subtle flex items-start gap-3">
              <CheckCircle2 size={20} className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[14px] font-bold text-text-main block">1. Local LAN Database</span>
                <span className="text-[12px] text-text-muted font-medium">PostgreSQL 16 Sovereign</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border-subtle flex items-start gap-3">
              <CheckCircle2 size={20} className="text-primary flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[14px] font-bold text-text-main block">2. Products & SKUs</span>
                <span className="text-[12px] text-primary font-bold">{totalProducts} SKUs Cataloged</span>
              </div>
            </div>

            {/* Step 3 */}
            <div
              onClick={() => onNavigate('sales')}
              className="p-3.5 rounded-xl bg-primary-soft/50 hover:bg-primary-soft border border-primary/30 flex items-start gap-3 cursor-pointer transition active:scale-98"
            >
              <div className="w-5 h-5 rounded-full border-2 border-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-primary" />
              </div>
              <div>
                <span className="text-[14px] font-bold text-primary block flex items-center gap-1">
                  3. Test POS Sale <ExternalLink size={12} />
                </span>
                <span className="text-[12px] text-text-muted font-medium">Process first receipt</span>
              </div>
            </div>

            {/* Step 4 */}
            <div
              onClick={() => onNavigate('settings')}
              className="p-3.5 rounded-xl bg-surface-2 hover:bg-surface border border-border-subtle flex items-start gap-3 cursor-pointer transition active:scale-98"
            >
              <div className="w-5 h-5 rounded-full border-2 border-border-strong flex items-center justify-center flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[14px] font-bold text-text-main block flex items-center gap-1">
                  4. Branding & TIN <ExternalLink size={12} />
                </span>
                <span className="text-[12px] text-text-muted font-medium">Receipt header & colors</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 3. Top KPI Cards (4 Standard + 1 Expiring on Wide Screens) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
        {/* KPI 1: Total Sales */}
        <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
              {language === 'am' ? 'ጠቅላላ ሽያጭ' : 'Total sales'}
            </span>
            <div className="w-11 h-11 rounded-xl bg-primary-soft text-primary flex items-center justify-center shadow-xs">
              <TrendingUp size={22} />
            </div>
          </div>
          <div>
            <div className="text-[28px] sm:text-[30px] font-extrabold font-mono text-text-main tabular-nums leading-none">
              {grossSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
              <span className="text-[16px] font-bold text-primary font-sans">ETB</span>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-bold">
                <ArrowUpRight size={13} />
                +12.4%
              </span>
              <span className="text-[12px] text-text-muted font-medium">
                {language === 'am' ? 'ካለፈው ጊዜ አንጻር' : 'vs last period'}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Number of Sales (Orders) */}
        <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
              {language === 'am' ? 'የሽያጭ ብዛት' : 'Number of sales'}
            </span>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <ShoppingCart size={22} />
            </div>
          </div>
          <div>
            <div className="text-[28px] sm:text-[30px] font-extrabold font-mono text-text-main tabular-nums leading-none">
              {orderCount}
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[12px] font-bold">
                <ArrowUpRight size={13} />
                +8.1%
              </span>
              <span className="text-[12px] text-text-muted font-medium">
                {language === 'am' ? 'ትዕዛዞች' : 'completed orders'}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 3: Items in Catalog */}
        <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
              {language === 'am' ? 'የእቃዎች ብዛት' : 'Items in catalog'}
            </span>
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-xs">
              <Package size={22} />
            </div>
          </div>
          <div>
            <div className="text-[28px] sm:text-[30px] font-extrabold font-mono text-text-main tabular-nums leading-none">
              {totalProducts}{' '}
              <span className="text-[16px] font-bold text-text-muted font-sans">SKUs</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 text-[12px] text-text-muted font-medium">
              <span className="w-2 h-2 rounded-full bg-purple-600" />
              <span>{language === 'am' ? 'በሱቅ ውስጥ የሚገኙ' : 'Active in store'}</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Low Stock */}
        <div className="p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
              {language === 'am' ? 'አነስተኛ ክምችት' : 'Low stock'}
            </span>
            <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
              <AlertTriangle size={22} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] sm:text-[30px] font-extrabold font-mono text-text-main tabular-nums leading-none">
                {lowStockCount + outOfStockCount}
              </span>
              {outOfStockCount > 0 && (
                <span className="text-[13px] font-bold text-rose-600 font-sans">
                  ({outOfStockCount} {language === 'am' ? 'አልቋል' : 'out'})
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => onNavigate('stock', 'low')}
                className="text-[12px] font-bold text-amber-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {language === 'am' ? 'ማዘዣ ያስፈልጋል' : 'Needs replenishment'} &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* KPI 5: Expiring Soon (Visible on Wide screens) */}
        <div className="hidden xl:flex p-5 rounded-2xl bg-surface border border-border-subtle shadow-card flex-col justify-between space-y-3 transition hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold uppercase tracking-wider text-text-muted">
              {language === 'am' ? 'የሚቃረብበት ጊዜ' : 'Expiring soon'}
            </span>
            <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-xs">
              <Clock size={22} />
            </div>
          </div>
          <div>
            <div className="text-[28px] sm:text-[30px] font-extrabold font-mono text-text-main tabular-nums leading-none">
              {expiringCount}{' '}
              <span className="text-[16px] font-bold text-rose-600 font-sans">
                {language === 'am' ? 'ባቾች' : 'batches'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => onNavigate('stock', 'expiring')}
                className="text-[12px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {language === 'am' ? 'በ30 ቀናት ውስጥ' : 'Within 30 days'} &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── 4. Charts Section: Sales Overview Line Chart & Category Donut ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left (2 cols): Sales Overview Line / Area Chart */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-extrabold text-text-main tracking-tight">
                {language === 'am' ? 'የሽያጭ አጠቃላይ እይታ' : 'Sales overview'}
              </h2>
              <p className="text-[13px] font-medium text-text-muted">
                {language === 'am'
                  ? 'የዚህ ሳምንት እና ያለፈው ሳምንት የቀን ሽያጭ ንጽጽር'
                  : 'Daily revenue comparison: this week vs last week'}
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[13px] font-bold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-text-main">{language === 'am' ? 'ይህ ሳምንት' : 'This week'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                <span className="text-text-muted">{language === 'am' ? 'ያለፈው ሳምንት' : 'Last week'}</span>
              </div>
            </div>
          </div>

          {/* SVG Smooth Area & Line Chart */}
          <div className="relative w-full overflow-hidden pt-2">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible"
            >
              <defs>
                <linearGradient id="primaryAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.00" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const y = chartHeight - paddingY - ratio * plotHeight;
                return (
                  <g key={i}>
                    <line
                      x1={paddingX}
                      y1={y}
                      x2={chartWidth - paddingX}
                      y2={y}
                      stroke="var(--border-subtle)"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingX - 8}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--text-dim)"
                      className="font-mono"
                    >
                      {Math.round(ratio * maxChartVal)}
                    </text>
                  </g>
                );
              })}

              {/* Area Under Curve (This Week) */}
              {areaPathThisWeek && (
                <path d={areaPathThisWeek} fill="url(#primaryAreaGrad)" />
              )}

              {/* Last Week Line (Dashed Slate) */}
              {linePathLastWeek && (
                <path
                  d={linePathLastWeek}
                  fill="none"
                  stroke="#94A3B8"
                  strokeWidth="2.5"
                  strokeDasharray="5 5"
                />
              )}

              {/* This Week Line (Solid Primary Green) */}
              {linePathThisWeek && (
                <path
                  d={linePathThisWeek}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
              )}

              {/* Interactive Data Points & Day Labels */}
              {pointsThisWeek.map((pt, i) => (
                <g key={i} className="group cursor-pointer">
                  {/* Vertical Hover guide line */}
                  <line
                    x1={pt.x}
                    y1={paddingY}
                    x2={pt.x}
                    y2={chartHeight - paddingY}
                    stroke="var(--primary)"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                    className="opacity-0 group-hover:opacity-60 transition"
                  />

                  {/* Circle on This Week Line */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="4.5"
                    fill="var(--bg-surface)"
                    stroke="var(--primary)"
                    strokeWidth="2.5"
                    className="transition group-hover:scale-150"
                  />

                  {/* Day Label */}
                  <text
                    x={pt.x}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="600"
                    fill="var(--text-muted)"
                  >
                    {pt.day}
                  </text>

                  {/* Invisible Hit Area for Tooltip */}
                  <rect
                    x={pt.x - 20}
                    y={paddingY}
                    width="40"
                    height={plotHeight}
                    fill="transparent"
                    onMouseEnter={() =>
                      setHoveredPoint({
                        day: pt.day,
                        thisWeek: pt.thisWeek,
                        lastWeek: pt.lastWeek,
                        x: pt.x,
                        y: pt.y,
                      })
                    }
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                </g>
              ))}
            </svg>

            {/* Floating Tooltip */}
            {hoveredPoint && (
              <div
                className="absolute z-20 pointer-events-none p-2.5 rounded-xl bg-text-main text-white text-[12px] shadow-lg border border-white/10"
                style={{
                  left: `${(hoveredPoint.x / chartWidth) * 100}%`,
                  top: '15px',
                  transform: 'translateX(-50%)',
                }}
              >
                <div className="font-bold text-[13px] border-b border-white/20 pb-1 mb-1">
                  {hoveredPoint.day}
                </div>
                <div className="flex items-center justify-between gap-3 text-emerald-300 font-bold font-mono">
                  <span>{language === 'am' ? 'ይህ ሳምንት:' : 'This week:'}</span>
                  <span>{hoveredPoint.thisWeek.toFixed(2)} ETB</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-slate-300 font-medium font-mono">
                  <span>{language === 'am' ? 'ያለፈው:' : 'Last week:'}</span>
                  <span>{hoveredPoint.lastWeek.toFixed(2)} ETB</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right (1 col): Sales by Category Donut Chart */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-[20px] font-extrabold text-text-main tracking-tight">
              {language === 'am' ? 'ሽያጭ በምድብ' : 'Sales by category'}
            </h2>
            <p className="text-[13px] font-medium text-text-muted">
              {language === 'am' ? 'የምርት ምድቦች የሽያጭ ድርሻ' : 'Revenue distribution by product categories'}
            </p>
          </div>

          {/* SVG Donut Chart */}
          <div className="flex flex-col items-center justify-center my-2">
            <div className="relative w-44 h-44">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="transparent"
                  stroke="var(--bg-surface-2)"
                  strokeWidth="14"
                />

                {/* Slices */}
                {salesByCategory.length > 0 ? (
                  salesByCategory.map((cat, i) => {
                    const circum = 2 * Math.PI * 38; // ~238.76
                    const pct = cat.percentage || (100 / salesByCategory.length);
                    const strokeLen = (pct / 100) * circum;
                    let prevOffset = 0;
                    for (let j = 0; j < i; j++) {
                      prevOffset += ((salesByCategory[j].percentage || (100 / salesByCategory.length)) / 100) * circum;
                    }

                    return (
                      <circle
                        key={cat.categoryId || i}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={categoryPalette[i % categoryPalette.length]}
                        strokeWidth="14"
                        strokeDasharray={`${strokeLen} ${circum}`}
                        strokeDashoffset={-prevOffset}
                        className="transition-all duration-300"
                      />
                    );
                  })
                ) : (
                  // Default clean retail baseline slice
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke="var(--primary)"
                    strokeWidth="14"
                    strokeDasharray="238 238"
                  />
                )}
              </svg>

              {/* Center Metric */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[20px] font-extrabold font-mono text-text-main">
                  {grossSales > 0 ? `${(grossSales / 1000).toFixed(1)}k` : '100%'}
                </span>
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {grossSales > 0 ? 'ETB Total' : (language === 'am' ? 'ዝግጁ' : 'Catalog')}
                </span>
              </div>
            </div>
          </div>

          {/* Category Legend */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            {salesByCategory.slice(0, 4).map((cat, idx) => (
              <div key={cat.categoryId || idx} className="flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: categoryPalette[idx % categoryPalette.length] }}
                  />
                  <span className="font-semibold text-text-main truncate">{cat.categoryName}</span>
                </div>
                <div className="flex items-center gap-2 font-mono tabular-nums font-bold text-text-muted">
                  <span>{cat.amount > 0 ? `${cat.amount.toFixed(0)} ETB` : ''}</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-surface-2 text-[11px] text-text-main">
                    {cat.percentage > 0 ? `${cat.percentage}%` : `${Math.round(100 / Math.max(salesByCategory.length, 1))}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 5. Bottom Section: Recent Sales & Stock / Expiry Alerts ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left (2 cols): Recent Sales Table */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[20px] font-extrabold text-text-main tracking-tight">
                {language === 'am' ? 'የቅርብ ጊዜ ሽያጮች' : 'Recent sales'}
              </h2>
              <p className="text-[13px] font-medium text-text-muted">
                {language === 'am' ? 'የቅርብ ጊዜ የተከናወኑ የካሸር ሽያጮች' : 'Latest completed checkout receipts'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-[14px] font-bold text-primary hover:text-primary-hover flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'am' ? 'ሁሉንም ይመልከቱ' : 'View all'}</span>
              <ExternalLink size={14} />
            </button>
          </div>

          {/* Table or Empty State */}
          {recentSales.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-border-subtle text-[13px] font-bold text-text-muted uppercase tracking-wider">
                    <th className="py-2.5 px-3">{language === 'am' ? 'ደረሰኝ ቁጥር' : 'Receipt #'}</th>
                    <th className="py-2.5 px-3">{language === 'am' ? 'ካሸር' : 'Cashier'}</th>
                    <th className="py-2.5 px-3">{language === 'am' ? 'ሰዓት' : 'Time'}</th>
                    <th className="py-2.5 px-3 text-right">{language === 'am' ? 'መጠን' : 'Amount'}</th>
                    <th className="py-2.5 px-3 text-center">{language === 'am' ? 'ሁኔታ' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-surface-2/60 transition font-medium">
                      <td className="py-3 px-3 font-mono font-bold text-primary flex items-center gap-2">
                        <Receipt size={16} />
                        <span>{sale.receiptNumber}</span>
                      </td>
                      <td className="py-3 px-3 text-text-main">{sale.cashierName}</td>
                      <td className="py-3 px-3 text-text-muted text-[13px]">
                        {new Date(sale.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-text-main text-right">
                        {sale.grandTotal.toFixed(2)} ETB
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[12px] font-bold border border-emerald-200">
                          {language === 'am' ? 'ተጠናቋል' : 'Completed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-surface-2/50 border border-border-subtle text-center flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shadow-xs">
                <Receipt size={24} />
              </div>
              <div>
                <h4 className="text-[16px] font-bold text-text-main">
                  {language === 'am' ? 'ዛሬ የተመዘገበ ሽያጭ የለም' : 'No sales recorded yet today'}
                </h4>
                <p className="text-[13px] text-text-muted font-medium mt-0.5">
                  {language === 'am'
                    ? 'አዲስ የደንበኛ ሽያጭ ለመጀመር የሽያጭ መስኮቱን ይክፈቱ።'
                    : 'Open POS checkout to start scanning and serving customers.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('sales')}
                className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-[14px] font-bold shadow-soft flex items-center gap-2 transition active:scale-95 cursor-pointer mt-1"
              >
                <ShoppingCart size={16} />
                <span>{language === 'am' ? 'አዲስ ሽያጭ ጀምር (F1)' : 'Start New Sale (F1)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right (1 col): Low Stock & Expiry Alerts List */}
        <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-border-subtle shadow-card flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[20px] font-extrabold text-text-main tracking-tight">
                {language === 'am' ? 'የክምችት ማስጠንቀቂያዎች' : 'Low stock & alerts'}
              </h2>
              <p className="text-[13px] font-medium text-text-muted">
                {language === 'am' ? 'ማዘዣ ወይም ቆጠራ የሚያስፈልጋቸው' : 'Items needing reorder or stock count'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-[14px] font-bold text-amber-600 hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{language === 'am' ? 'ክምችት' : 'Stock'}</span>
              &rarr;
            </button>
          </div>

          {/* Alerts List */}
          <div className="space-y-2.5">
            {alerts.length > 0 ? (
              alerts.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  onClick={() => onNavigate('stock', 'low')}
                  className="p-3 rounded-xl bg-surface-2 hover:bg-surface border border-border-subtle flex items-center justify-between gap-3 cursor-pointer transition active:scale-98 group"
                >
                  <div className="flex items-center gap-3 truncate">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        item.severity === 'DANGER'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {item.severity === 'DANGER' ? (
                        <AlertCircle size={18} />
                      ) : (
                        <AlertTriangle size={18} />
                      )}
                    </div>
                    <div className="truncate">
                      <span className="text-[14px] font-bold text-text-main block truncate group-hover:text-primary transition">
                        {item.productName}
                      </span>
                      <span className="text-[12px] font-mono text-text-muted">
                        {item.sku}
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md text-[12px] font-extrabold font-mono ${
                        item.currentStock <= 0
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.currentStock} {item.uom}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 rounded-xl bg-surface-2/40 border border-border-subtle text-center">
                <CheckCircle2 size={24} className="text-primary mx-auto mb-1.5" />
                <span className="text-[14px] font-bold text-text-main block">
                  {language === 'am' ? 'ሁሉም ክምችት በቂ ነው' : 'All inventory levels healthy'}
                </span>
                <span className="text-[12px] text-text-muted font-medium">
                  {language === 'am' ? 'ምንም አይነት እጥረት የለም' : 'No low stock or expiry alerts'}
                </span>
              </div>
            )}
          </div>

          {/* Quick Action Button */}
          <button
            type="button"
            onClick={() => {
              if (onOpenAddStock) onOpenAddStock();
              else onNavigate('stock');
            }}
            className="w-full py-2.5 rounded-xl bg-surface-2 hover:bg-surface border border-border-subtle text-text-main text-[14px] font-bold flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer shadow-xs"
          >
            <Plus size={16} className="text-primary" />
            <span>{language === 'am' ? 'አዲስ ክምችት አስገባ' : 'Receive New Stock'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
