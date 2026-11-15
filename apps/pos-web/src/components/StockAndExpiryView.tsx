import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  Calendar,
  Layers,
  Search,
  Filter,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertOctagon,
  Trash2,
  FileEdit,
  ClipboardList,
  Eye,
  Lock,
  ArrowUpDown,
  X,
  ShieldAlert,
  Archive,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { posApi } from '../utils/pos-api';
import {
  StockAdjustmentReasonCode,
  computeDaysLeftInAddis,
  getExpiryStatus,
  formatEthiopianDisplayDate,
} from '@gebeyaos/shared-types';
import { AddStockChooserModal } from './inventory/AddStockChooserModal';
import { ScanStockDrawer } from './inventory/ScanStockDrawer';
import { ManualStockDrawer } from './inventory/ManualStockDrawer';
import { ExcelImportModal } from './inventory/ExcelImportModal';
import { ImportHistoryModal } from './inventory/ImportHistoryModal';
import { ProductLedgerDrawer } from './inventory/ProductLedgerDrawer';
import { BarcodeLabelModal, LabelProductItem } from './catalog/BarcodeLabelModal';

interface StockItem {
  id: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  category_id?: string;
  category_name?: string;
  category_name_am?: string | null;
  uom_code: string;
  base_price: number | string;
  cost_price: number | string;
  override_price?: number | string | null;
  min_stock_level: number | string;
  stock_on_hand: number | string;
  is_weighed?: boolean;
  barcodes?: string[];
  image_url?: string;
  is_active?: boolean;
  nearest_expiry?: string | null;
}

interface BatchItem {
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  uom: string;
  expiryDate: string;
  daysUntilExpiry: number;
  quantityOnHand: number;
  unitCost: number;
  potentialLossValue: number;
  isExpired: boolean;
}

export const StockAndExpiryView: React.FC = () => {
  const { language, t, formatCurrency } = useI18n();
  const { hasPermission, currentUser } = useAuth();

  const [products, setProducts] = useState<StockItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name_en: string; name_am?: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // View Mode: By Item (Stock) vs By Batch (Expiry)
  const [viewMode, setViewMode] = useState<'item' | 'batch'>('item');

  // Filter Tabs: All | Expiring soon | Low stock | Expired
  const [filterTab, setFilterTab] = useState<'all' | 'expiring_soon' | 'low_stock' | 'expired'>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Modals state for Add Stock workflows
  const [isChooserOpen, setIsChooserOpen] = useState<boolean>(false);
  const [isScanOpen, setIsScanOpen] = useState<boolean>(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [isExcelOpen, setIsExcelOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // Row Ledger Drawer
  const [selectedDrawerProduct, setSelectedDrawerProduct] = useState<StockItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Stock Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjReason, setAdjReason] = useState<StockAdjustmentReasonCode>('DAMAGED_GOODS');
  const [adjQuantity, setAdjQuantity] = useState<number>(-1);
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSubmitting, setAdjSubmitting] = useState<boolean>(false);

  // Single Item Stock Count Modal (Inline Stocktake)
  const [countTarget, setCountTarget] = useState<StockItem | null>(null);
  const [countedQty, setCountedQty] = useState<string>('');
  const [countReason, setCountReason] = useState<string>('Physical stock verification');
  const [countSubmitting, setCountSubmitting] = useState<boolean>(false);
  const [countError, setCountError] = useState<string | null>(null);

  // Thermal Label Printing
  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [selectedForLabels, setSelectedForLabels] = useState<LabelProductItem[]>([]);

  // Write Off Expired Batch State
  const [writeOffBatch, setWriteOffBatch] = useState<BatchItem | null>(null);
  const [writeOffReason, setWriteOffReason] = useState<string>('Expired inventory disposal');
  const [writeOffSubmitting, setWriteOffSubmitting] = useState<boolean>(false);
  const [writeOffError, setWriteOffError] = useState<string | null>(null);

  const canCreateAdjustment =
    hasPermission('inventory:adjust:create') ||
    currentUser?.role === 'HQ_ADMIN' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'STOREKEEPER' ||
    currentUser?.role === 'OWNER';

  // Fetch Inventory and Batches
  const fetchData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, expiringRes] = await Promise.all([
        posApi.getCatalogProducts({
          search: search.trim() || undefined,
          category_id: selectedCategory || undefined,
          limit: 300,
          branchId: currentUser?.branchId,
        }),
        fetch('/api/products/categories').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/reports/inventory/expiring?days=365').then((r) => (r.ok ? r.json() : null)),
      ]);

      if (prodRes?.rows) {
        setProducts(prodRes.rows);
      }
      if (Array.isArray(catRes)) {
        setCategories(catRes);
      }
      if (expiringRes?.batches) {
        setBatches(expiringRes.batches);
      }
    } catch (err) {
      console.warn('Failed to load inventory data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(fetchData, 200);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, currentUser]);

  // Color initial palette
  const getInitialColor = (name: string) => {
    const palette = [
      { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300' },
      { bg: 'bg-blue-100 dark:bg-blue-950/60', text: 'text-blue-700 dark:text-blue-300' },
      { bg: 'bg-purple-100 dark:bg-purple-950/60', text: 'text-purple-700 dark:text-purple-300' },
      { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300' },
      { bg: 'bg-teal-100 dark:bg-teal-950/60', text: 'text-teal-700 dark:text-teal-300' },
      { bg: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300' },
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  // Batches sorted by nearest expiry date (FEFO)
  const sortedBatches = useMemo(() => {
    return [...batches].sort((a, b) => {
      const daysA = computeDaysLeftInAddis(a.expiryDate) ?? a.daysUntilExpiry ?? 99999;
      const daysB = computeDaysLeftInAddis(b.expiryDate) ?? b.daysUntilExpiry ?? 99999;
      return daysA - daysB;
    });
  }, [batches]);

  // KPI calculations (strictly matching active view tab counts)
  const kpis = useMemo(() => {
    if (viewMode === 'batch') {
      let expiredCount = 0;
      let expiring7Count = 0;
      let expiring30Count = 0;
      let lowStockCount = 0;

      sortedBatches.forEach((b) => {
        const days = computeDaysLeftInAddis(b.expiryDate) ?? b.daysUntilExpiry;
        if (days <= 0) expiredCount++;
        else if (days <= 7) {
          expiring7Count++;
          expiring30Count++;
        } else if (days <= 30) {
          expiring30Count++;
        }
        if (b.quantityOnHand <= 5) lowStockCount++;
      });

      return {
        expired: expiredCount,
        expiring7: expiring7Count,
        expiring30: expiring30Count,
        lowStock: lowStockCount,
        total: sortedBatches.length,
      };
    } else {
      let expiredCount = 0;
      let expiring7Count = 0;
      let expiring30Count = 0;
      let lowStockCount = 0;

      products.forEach((p) => {
        const onHand = Number(p.stock_on_hand || 0);
        const min = Number(p.min_stock_level || 0);
        const days = computeDaysLeftInAddis(p.nearest_expiry);

        if (days !== null) {
          if (days <= 0) expiredCount++;
          else if (days <= 7) {
            expiring7Count++;
            expiring30Count++;
          } else if (days <= 30) {
            expiring30Count++;
          }
        }
        if (onHand <= min) lowStockCount++;
      });

      return {
        expired: expiredCount,
        expiring7: expiring7Count,
        expiring30: expiring30Count,
        lowStock: lowStockCount,
        total: products.length,
      };
    }
  }, [viewMode, sortedBatches, products]);

  // Filtered Products (Item View)
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const onHand = Number(p.stock_on_hand || 0);
      const min = Number(p.min_stock_level || 0);
      const days = computeDaysLeftInAddis(p.nearest_expiry);

      if (filterTab === 'low_stock') {
        return onHand <= min;
      }
      if (filterTab === 'expiring_soon') {
        return days !== null && days <= 30 && days > 0;
      }
      if (filterTab === 'expired') {
        return days !== null && days <= 0;
      }
      return true;
    });
  }, [products, filterTab]);

  // Filtered Batches (Batch View)
  const filteredBatches = useMemo(() => {
    return sortedBatches.filter((b) => {
      const days = computeDaysLeftInAddis(b.expiryDate) ?? b.daysUntilExpiry;
      if (filterTab === 'low_stock') {
        return b.quantityOnHand <= 5;
      }
      if (filterTab === 'expiring_soon') {
        return days <= 30 && days > 0;
      }
      if (filterTab === 'expired') {
        return days <= 0;
      }
      return true;
    });
  }, [sortedBatches, filterTab]);

  // Open Adjust Modal
  const handleOpenAdjustment = (product: StockItem) => {
    setAdjProductId(product.id);
    setAdjReason('DAMAGED_GOODS');
    setAdjQuantity(-1);
    setAdjNotes('');
    setManagerPin('');
    setAdjError(null);
    setIsAdjModalOpen(true);
  };

  // Submit Adjustment
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);

    if (!canCreateAdjustment) {
      setAdjError('You do not have permission to adjust inventory.');
      return;
    }
    if (!adjProductId) {
      setAdjError('Please select an item.');
      return;
    }
    if (adjQuantity === 0) {
      setAdjError('Quantity change cannot be zero.');
      return;
    }
    if (!adjNotes.trim()) {
      setAdjError(t('inventory.reasonRequired'));
      return;
    }

    setAdjSubmitting(true);
    try {
      await fetch('/api/inventory/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-branch-id': currentUser?.branchId || '00000000-0000-0000-0000-000000000001',
        },
        body: JSON.stringify({
          branchId: currentUser?.branchId,
          reasonCode: adjReason,
          notes: adjNotes.trim(),
          items: [
            {
              productId: adjProductId,
              quantityChange: Number(adjQuantity),
              reasonCode: adjReason,
            },
          ],
        }),
      });

      setSuccessMsg(t('inventory.stockUpdatedSuccess', { name: products.find((p) => p.id === adjProductId)?.name_en || 'Product' }));
      setIsAdjModalOpen(false);
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setAdjError(err.message || 'Failed to submit adjustment');
    } finally {
      setAdjSubmitting(false);
    }
  };

  // Open Count Modal
  const handleOpenCount = (product: StockItem) => {
    setCountTarget(product);
    setCountedQty(String(Number(product.stock_on_hand || 0)));
    setCountReason('Physical count verification');
    setCountError(null);
  };

  // Submit Count / Stocktake
  const handleSubmitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countTarget) return;
    setCountError(null);

    const countedVal = parseFloat(countedQty);
    if (isNaN(countedVal) || countedVal < 0) {
      setCountError('Please enter a valid non-negative counted quantity.');
      return;
    }
    if (!countReason.trim()) {
      setCountError(t('inventory.reasonRequired'));
      return;
    }

    const currentOnHand = Number(countTarget.stock_on_hand || 0);
    const variance = countedVal - currentOnHand;

    setCountSubmitting(true);
    try {
      if (variance !== 0) {
        await fetch('/api/inventory/adjustments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-branch-id': currentUser?.branchId || '00000000-0000-0000-0000-000000000001',
          },
          body: JSON.stringify({
            branchId: currentUser?.branchId,
            reasonCode: 'COUNT_CORRECTION',
            notes: `${countReason.trim()} (Counted: ${countedVal}, System: ${currentOnHand}, Variance: ${variance > 0 ? '+' : ''}${variance})`,
            items: [
              {
                productId: countTarget.id,
                quantityChange: variance,
                reasonCode: 'COUNT_CORRECTION',
              },
            ],
          }),
        });
      }

      setSuccessMsg(t('inventory.countUpdatedSuccess', { name: countTarget.name_en }));
      setCountTarget(null);
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setCountError(err.message || 'Failed to submit stock count');
    } finally {
      setCountSubmitting(false);
    }
  };

  // Submit Write-Off for Expired Batch
  const handleConfirmWriteOff = async () => {
    if (!writeOffBatch) return;
    setWriteOffSubmitting(true);
    setWriteOffError(null);
    try {
      await posApi.writeOffExpiredBatch(
        writeOffBatch.batchId,
        writeOffReason.trim() || 'Expired inventory disposal',
        currentUser?.branchId,
      );
      setSuccessMsg(
        t('inventory.writeOffSuccess', {
          batch: writeOffBatch.batchNumber,
          qty: writeOffBatch.quantityOnHand,
        }),
      );
      setWriteOffBatch(null);
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setWriteOffError(err.message || 'Failed to write off expired batch');
    } finally {
      setWriteOffSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* ─── 1. Header & Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="text-emerald-600" size={24} />
              {t('inventory.stockAndExpiry')}
            </h1>
            <p className="text-xs text-slate-500">
              {t('inventory.stockAndExpirySubtitle')}
            </p>
          </div>

          {/* View Mode Toggle: By Item vs By Batch */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl border border-slate-300/60 dark:border-slate-700 self-start">
            <button
              type="button"
              onClick={() => setViewMode('item')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'item'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Package size={14} className="text-emerald-600 dark:text-emerald-400" />
              {t('inventory.viewByItem')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'batch'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Calendar size={14} className="text-amber-500" />
              {t('inventory.viewByBatch')}
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 font-mono">
                {batches.length}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Action Button: Add Stock */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsChooserOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <Plus size={16} />
            {t('inventory.addStock')}
          </button>
        </div>
      </div>

      {/* Global Toast Success Message */}
      {successMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Daily Expiration Alert Notification Banner */}
      {(kpis.expired > 0 || kpis.expiring7 > 0) && (
        <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertOctagon size={18} className="text-rose-600 shrink-0" />
            <span>
              {t('inventory.dailyExpirationAlert', {
                expired: kpis.expired,
                expiring: kpis.expiring7,
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFilterTab('expired')}
            className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shrink-0 shadow-xs"
          >
            {t('inventory.expired')} ({kpis.expired})
          </button>
        </div>
      )}

      {/* ─── 2. Top KPI Cards ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Card 1: Expired */}
        <div
          onClick={() => setFilterTab(filterTab === 'expired' ? 'all' : 'expired')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            filterTab === 'expired'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 ring-2 ring-rose-400/20'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-rose-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('inventory.expired')}
            </div>
            <div className="text-xl font-black text-rose-600 font-mono">
              {kpis.expired}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
            <AlertOctagon size={18} />
          </div>
        </div>

        {/* Card 2: Expiring in 7 Days */}
        <div
          onClick={() => setFilterTab(filterTab === 'expiring_soon' ? 'all' : 'expiring_soon')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            filterTab === 'expiring_soon'
              ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-400 ring-2 ring-orange-400/20'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-orange-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('inventory.expiringIn7Days')}
            </div>
            <div className="text-xl font-black text-orange-600 font-mono">
              {kpis.expiring7}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 flex items-center justify-center">
            <AlertTriangle size={18} />
          </div>
        </div>

        {/* Card 3: Expiring in 30 Days */}
        <div
          onClick={() => setFilterTab(filterTab === 'expiring_soon' ? 'all' : 'expiring_soon')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            filterTab === 'expiring_soon'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 ring-2 ring-amber-400/20'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-amber-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('inventory.expiringIn30Days')}
            </div>
            <div className="text-xl font-black text-amber-600 font-mono">
              {kpis.expiring30}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
            <Clock size={18} />
          </div>
        </div>

        {/* Card 4: Low Stock */}
        <div
          onClick={() => setFilterTab(filterTab === 'low_stock' ? 'all' : 'low_stock')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            filterTab === 'low_stock'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-400 ring-2 ring-red-400/20'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-red-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {t('inventory.lowStock')}
            </div>
            <div className="text-xl font-black text-red-600 font-mono">
              {kpis.lowStock}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center">
            <AlertCircle size={18} />
          </div>
        </div>
      </div>

      {/* ─── 3. Sub-tabs & Search Toolbar ─── */}
      <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Left: Four Filter Tabs */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-900 p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              filterTab === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t('inventory.allStock')}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('expiring_soon')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
              filterTab === 'expiring_soon'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t('inventory.expiringSoon')}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('low_stock')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
              filterTab === 'low_stock'
                ? 'bg-orange-500 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t('inventory.lowStock')}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('expired')}
            className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1 ${
              filterTab === 'expired'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t('inventory.expired')}
          </button>
        </div>

        {/* Right: Search, Category, Refresh */}
        <div className="flex flex-1 items-center gap-2 justify-end min-w-[260px]">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search item, barcode, batch..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">{language === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            title="Refresh"
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── 4. Main Table View ─── */}
      <div className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-auto">
          {viewMode === 'item' ? (
            /* ── VIEW 1: BY ITEM ── */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-800/80 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3.5 pl-5">Item</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-right">Quantity on Hand</th>
                  <th className="p-3.5 text-center">{t('inventory.nearestExpiry')}</th>
                  <th className="p-3.5 text-center">{t('inventory.daysLeft')}</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading inventory items...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <Package size={36} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                      No items match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const onHand = Number(p.stock_on_hand || 0);
                    const min = Number(p.min_stock_level || 0);
                    const isLow = onHand <= min && onHand > 0;
                    const isOut = onHand <= 0;
                    const days = computeDaysLeftInAddis(p.nearest_expiry);
                    const isExpired = days !== null && days <= 0;
                    const initialStyle = getInitialColor(p.name_en || 'Product');
                    const expStatus = getExpiryStatus(p.nearest_expiry, 30);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        {/* Item */}
                        <td className="p-3.5 pl-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl ${
                                p.image_url ? 'bg-slate-100 dark:bg-slate-800' : initialStyle.bg
                              } border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0 shadow-xs`}
                            >
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name_en} className="w-full h-full object-cover" />
                              ) : (
                                <span className={`font-black text-xs ${initialStyle.text}`}>
                                  {p.name_en.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                {p.name_en}
                              </div>
                              {p.name_am && (
                                <div className="text-[11px] text-slate-500 font-sans">{p.name_am}</div>
                              )}
                              <div className="text-[10px] font-mono text-slate-400">
                                SKU: {p.sku}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                          {p.category_name || 'General'}
                        </td>

                        {/* Quantity on Hand with Unit */}
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                          <span>{onHand.toFixed(2)}</span>{' '}
                          <span className="text-[10px] text-slate-500 font-sans">{p.uom_code || 'PCS'}</span>
                        </td>

                        {/* Nearest Expiry Date */}
                        <td className="p-3.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                          {p.nearest_expiry ? p.nearest_expiry.slice(0, 10) : '—'}
                        </td>

                        {/* Days Left Badge with Icon & Text */}
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              expStatus.tier === 'NO_EXPIRY'
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                : expStatus.tier === 'EXPIRED' || expStatus.tier === 'TODAY'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200'
                                : expStatus.tier === 'CRITICAL'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200'
                                : expStatus.tier === 'WARNING'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                            }`}
                          >
                            {expStatus.tier === 'EXPIRED' && <AlertOctagon size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'TODAY' && <Clock size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'CRITICAL' && <AlertTriangle size={12} className="text-orange-600 shrink-0" />}
                            {expStatus.tier === 'WARNING' && <Calendar size={12} className="text-amber-600 shrink-0" />}
                            {expStatus.tier === 'GOOD' && <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />}
                            <span>{language === 'am' ? expStatus.labelAm : expStatus.labelEn}</span>
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-3.5 text-center">
                          {isExpired ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 text-[10px] font-bold">
                              {t('inventory.expired')}
                            </span>
                          ) : isOut ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 text-[10px] font-bold">
                              {t('inventory.outOfStock')}
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 text-[10px] font-bold">
                              {t('inventory.lowStockThreshold', { count: min })}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 text-[10px] font-bold">
                              {t('inventory.inStock')}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Adjust Stock */}
                            <button
                              type="button"
                              onClick={() => handleOpenAdjustment(p)}
                              title={t('inventory.adjustStock')}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <FileEdit size={12} className="text-amber-500" />
                              {t('inventory.adjustStock')}
                            </button>

                            {/* Count Stock (Inline Single Item) */}
                            <button
                              type="button"
                              onClick={() => handleOpenCount(p)}
                              title={t('inventory.countStock')}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <ClipboardList size={12} className="text-emerald-600" />
                              {t('inventory.countStock')}
                            </button>

                            {/* View Batches / Ledger */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDrawerProduct(p);
                                setIsDrawerOpen(true);
                              }}
                              title={t('inventory.viewBatches')}
                              className="p-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-500 transition"
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ── VIEW 2: BY BATCH (EXPIRY-FIRST VIEW) ── */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/75 dark:bg-slate-800/80 text-[11px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3.5 pl-5">Batch Number</th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5 text-right">Quantity</th>
                  <th className="p-3.5 text-center">Expiry Date</th>
                  <th className="p-3.5 text-center">Days Remaining</th>
                  <th className="p-3.5 text-right">Potential Loss</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {loading && batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-emerald-600" />
                      Loading inventory batches...
                    </td>
                  </tr>
                ) : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400">
                      <Calendar size={36} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                      No batches match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => {
                    const days = computeDaysLeftInAddis(b.expiryDate) ?? b.daysUntilExpiry;
                    const expStatus = getExpiryStatus(b.expiryDate, 30);
                    const isExpired = days <= 0;

                    return (
                      <tr key={b.batchId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="p-3.5 pl-5 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {b.batchNumber}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900 dark:text-white">
                          {b.productName}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">
                          {b.quantityOnHand} <span className="text-[10px] text-slate-400">{b.uom}</span>
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {b.expiryDate ? b.expiryDate.slice(0, 10) : '—'}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              expStatus.tier === 'NO_EXPIRY'
                                ? 'bg-slate-100 dark:bg-slate-700 text-slate-500'
                                : expStatus.tier === 'EXPIRED' || expStatus.tier === 'TODAY'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200'
                                : expStatus.tier === 'CRITICAL'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200'
                                : expStatus.tier === 'WARNING'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                            }`}
                          >
                            {expStatus.tier === 'EXPIRED' && <AlertOctagon size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'TODAY' && <Clock size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'CRITICAL' && <AlertTriangle size={12} className="text-orange-600 shrink-0" />}
                            {expStatus.tier === 'WARNING' && <Calendar size={12} className="text-amber-600 shrink-0" />}
                            {expStatus.tier === 'GOOD' && <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />}
                            <span>{language === 'am' ? expStatus.labelAm : expStatus.labelEn}</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold text-rose-600">
                          {b.potentialLossValue.toFixed(2)} ETB
                        </td>
                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isExpired && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWriteOffBatch(b);
                                  setWriteOffReason('Expired stock disposal');
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold border border-rose-200 dark:border-rose-800 flex items-center gap-1 transition"
                              >
                                <Trash2 size={12} className="text-rose-600" />
                                {t('inventory.writeOffExpired')}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const matchingProd = products.find((p) => p.id === b.productId);
                                if (matchingProd) handleOpenAdjustment(matchingProd);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-bold transition"
                            >
                              {t('inventory.adjustStock')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── 5. Add Stock Chooser Modal (Scan / Manual / Excel) ─── */}
      <AddStockChooserModal
        isOpen={isChooserOpen}
        onClose={() => setIsChooserOpen(false)}
        onSelectScan={() => setIsScanOpen(true)}
        onSelectManual={() => setIsManualOpen(true)}
        onSelectExcel={() => setIsExcelOpen(true)}
        onSelectAdjustment={() => setIsAdjModalOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      <ScanStockDrawer
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        onCommitSuccess={(msg) => {
          setSuccessMsg(msg);
          fetchData();
        }}
        existingProducts={products}
      />

      <ManualStockDrawer
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        onCommitSuccess={(msg) => {
          setSuccessMsg(msg);
          fetchData();
        }}
        existingProducts={products}
      />

      <ExcelImportModal
        isOpen={isExcelOpen}
        onClose={() => setIsExcelOpen(false)}
        onCommitSuccess={(msg) => {
          setSuccessMsg(msg);
          fetchData();
        }}
        existingProducts={products}
      />

      <ImportHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

      <ProductLedgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        product={selectedDrawerProduct as any}
        canViewCost={canCreateAdjustment}
        onOpenAdjustment={(p) => {
          setIsDrawerOpen(false);
          handleOpenAdjustment(p);
        }}
        onPrintLabel={() => {
          window.print();
        }}
      />

      {/* ─── 6. Single Item Stock Count Modal (Inline Stocktake) ─── */}
      {countTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {t('inventory.countStockModalTitle')}
                  </h3>
                  <p className="text-xs text-slate-500">{countTarget.name_en}</p>
                </div>
              </div>
              <button
                onClick={() => setCountTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            {countError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{countError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitCount} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{t('inventory.systemQuantity')}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {Number(countTarget.stock_on_hand || 0).toFixed(2)} {countTarget.uom_code}
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {t('inventory.countedQuantity')} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-emerald-400 font-mono text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Variance Computed Display */}
                {(() => {
                  const sys = Number(countTarget.stock_on_hand || 0);
                  const counted = parseFloat(countedQty) || 0;
                  const variance = counted - sys;
                  return (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span className="font-bold text-slate-600 dark:text-slate-400">{t('inventory.variance')}</span>
                      <span
                        className={`font-mono font-black ${
                          variance === 0
                            ? 'text-emerald-600'
                            : variance < 0
                            ? 'text-rose-600'
                            : 'text-indigo-600'
                        }`}
                      >
                        {variance > 0 ? `+${variance.toFixed(2)}` : variance.toFixed(2)} {countTarget.uom_code}
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical inventory count verified"
                  value={countReason}
                  onChange={(e) => setCountReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCountTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={countSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {countSubmitting && <RefreshCw size={13} className="animate-spin" />}
                  Confirm Stock Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 7. Stock Adjustment Modal ─── */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                  <FileEdit size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {t('inventory.adjustStock')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {products.find((p) => p.id === adjProductId)?.name_en || 'Select Item'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAdjModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            {adjError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{adjError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Reason Code *
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value as StockAdjustmentReasonCode)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="DAMAGED_GOODS">Damaged / Spoilage</option>
                  <option value="EXPIRED_GOODS">Expired Goods</option>
                  <option value="THEFT_OR_SHRINKAGE">Lost / Unaccounted Theft</option>
                  <option value="COUNT_CORRECTION">Correction / Variance</option>
                  <option value="INTERNAL_USE">Internal Supermarket Use</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Quantity Adjustment (Negative to deduct, Positive to add) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjQuantity}
                  onChange={(e) => setAdjQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Audit Notes / Reason *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Expired batch discarded, broken during stocking"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {adjSubmitting && <RefreshCw size={13} className="animate-spin" />}
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── 8. Write Off Expired Batch Modal ─── */}
      {writeOffBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {t('inventory.writeOffExpired')}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {writeOffBatch.productName} • Batch #{writeOffBatch.batchNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWriteOffBatch(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-400"
              >
                <X size={16} />
              </button>
            </div>

            {writeOffError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{writeOffError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 space-y-1.5">
              <p className="font-semibold">
                {t('inventory.writeOffConfirm', {
                  batch: writeOffBatch.batchNumber,
                  qty: writeOffBatch.quantityOnHand,
                })}
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                {language === 'am' ? 'የሚጣለው ዋጋ፡' : 'Potential loss value:'}{' '}
                {writeOffBatch.potentialLossValue.toFixed(2)} ETB ({writeOffBatch.quantityOnHand} {writeOffBatch.uom})
              </p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                {t('inventory.writeOffReason')} *
              </label>
              <input
                type="text"
                required
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWriteOffBatch(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
              >
                {language === 'am' ? 'ሰርዝ' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={writeOffSubmitting}
                onClick={handleConfirmWriteOff}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                {writeOffSubmitting && <RefreshCw size={13} className="animate-spin" />}
                {t('inventory.writeOffExpired')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
