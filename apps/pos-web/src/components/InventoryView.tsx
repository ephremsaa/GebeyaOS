import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  FileEdit,
  CheckCircle2,
  Search,
  X,
  Plus,
  History,
  Layers,
  Calendar,
  Filter,
  DollarSign,
  ShieldAlert,
  ArrowUpDown,
  RefreshCw,
  Printer,
  Eye,
  EyeOff,
  ChevronRight,
  Clock,
  Lock,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { posApi } from '../utils/pos-api';
import { StockAdjustmentReasonCode } from '@gebeyaos/shared-types';
import { AddStockChooserModal } from './inventory/AddStockChooserModal';
import { ScanStockDrawer } from './inventory/ScanStockDrawer';
import { ManualStockDrawer } from './inventory/ManualStockDrawer';
import { ExcelImportModal } from './inventory/ExcelImportModal';
import { ImportHistoryModal } from './inventory/ImportHistoryModal';
import { ProductLedgerDrawer } from './inventory/ProductLedgerDrawer';
import { BarcodeLabelModal, LabelProductItem } from './catalog/BarcodeLabelModal';

interface InventoryProductItem {
  id: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  category_id?: string;
  category_name?: string;
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
  earliest_expiry?: string | null;
}

export const InventoryView: React.FC = () => {
  const { language } = useI18n();
  const { hasPermission, currentUser } = useAuth();

  const [products, setProducts] = useState<InventoryProductItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name_en: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon'>('all');
  const [fefoSort, setFefoSort] = useState<boolean>(false);

  // Modals state
  const [isChooserOpen, setIsChooserOpen] = useState<boolean>(false);
  const [isScanOpen, setIsScanOpen] = useState<boolean>(false);
  const [isManualOpen, setIsManualOpen] = useState<boolean>(false);
  const [isExcelOpen, setIsExcelOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);

  // Row Ledger Drawer
  const [selectedDrawerProduct, setSelectedDrawerProduct] = useState<InventoryProductItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Thermal Label Printing
  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [selectedForLabels, setSelectedForLabels] = useState<LabelProductItem[]>([]);

  // Stock Adjustment Form State
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjReason, setAdjReason] = useState<StockAdjustmentReasonCode>('DAMAGED_GOODS');
  const [adjQuantity, setAdjQuantity] = useState<number>(-1);
  const [adjNotes, setAdjNotes] = useState<string>('');
  const [managerPin, setManagerPin] = useState<string>('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjSubmitting, setAdjSubmitting] = useState<boolean>(false);

  // Cost visibility permission check
  const canViewCost =
    hasPermission('catalog:cost:view') ||
    currentUser?.role === 'HQ_ADMIN' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'ACCOUNTANT' ||
    currentUser?.role === 'OWNER';

  const canCreateAdjustment =
    hasPermission('inventory:adjust:create') ||
    currentUser?.role === 'HQ_ADMIN' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'STOREKEEPER' ||
    currentUser?.role === 'OWNER';

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const data = await posApi.getCatalogProducts({
        search: search.trim() || undefined,
        category_id: selectedCategory || undefined,
        limit: 200,
        branchId: currentUser?.branchId,
      });

      if (data?.rows) {
        setProducts(data.rows);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.warn('Backend products endpoint unavailable', err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/products/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCategories(data);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch categories', err);
    }
    setCategories([]);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchInventory, 250);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, currentUser]);

  // Derived filtered & sorted items
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const onHand = Number(p.stock_on_hand || 0);
      const minStock = Number(p.min_stock_level || 0);

      if (statusFilter === 'in_stock' && onHand <= 0) return false;
      if (statusFilter === 'out_of_stock' && onHand > 0) return false;
      if (statusFilter === 'low_stock' && (onHand > minStock || onHand <= 0)) return false;
      if (statusFilter === 'expiring_soon' && !p.earliest_expiry) return false;

      return true;
    });
  }, [products, statusFilter]);

  const sortedProducts = useMemo(() => {
    if (!fefoSort) return filteredProducts;
    return [...filteredProducts].sort((a, b) => {
      if (!a.earliest_expiry) return 1;
      if (!b.earliest_expiry) return -1;
      return new Date(a.earliest_expiry).getTime() - new Date(b.earliest_expiry).getTime();
    });
  }, [filteredProducts, fefoSort]);

  // KPI summaries
  const totalCount = products.length;
  const lowCount = products.filter((p) => {
    const onHand = Number(p.stock_on_hand || 0);
    const minStock = Number(p.min_stock_level || 0);
    return onHand <= minStock && onHand > 0;
  }).length;
  const outCount = products.filter((p) => Number(p.stock_on_hand || 0) <= 0).length;

  const handleRowClick = (product: InventoryProductItem) => {
    setSelectedDrawerProduct(product);
    setIsDrawerOpen(true);
  };

  const handleOpenAdjustmentForProduct = (product: InventoryProductItem) => {
    setAdjProductId(product.id);
    setAdjReason('DAMAGED_GOODS');
    setAdjQuantity(-1);
    setAdjNotes('');
    setManagerPin('');
    setAdjError(null);
    setIsAdjModalOpen(true);
  };

  const handlePrintSingleLabel = (p: InventoryProductItem) => {
    const item: LabelProductItem = {
      id: p.id,
      sku: p.sku,
      barcode: p.barcodes?.[0] || p.sku,
      nameEn: p.name_en,
      nameAm: p.name_am,
      sellingPrice: Number(p.override_price ?? p.base_price),
      isVatApplicable: true,
    };
    setSelectedForLabels([item]);
    setIsLabelModalOpen(true);
  };

  // Large write-off calculation
  const targetProduct = products.find((p) => p.id === adjProductId);
  const estCost = targetProduct ? Number(targetProduct.cost_price || 100) : 100;
  const isLoss = adjQuantity < 0;
  const writeOffUnits = Math.abs(adjQuantity);
  const writeOffValue = writeOffUnits * estCost;
  const isLargeWriteOff = isLoss && (writeOffUnits > 20 || writeOffValue > 5000);

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjError(null);

    if (!canCreateAdjustment) {
      setAdjError('You do not have permission to record inventory adjustments.');
      return;
    }
    if (!adjProductId) {
      setAdjError('Please select a product.');
      return;
    }
    if (adjQuantity === 0) {
      setAdjError('Quantity change cannot be zero.');
      return;
    }
    if (!adjNotes.trim()) {
      setAdjError('Please provide an explanation / audit reason.');
      return;
    }
    if (isLargeWriteOff && managerPin !== '1234' && managerPin !== '0000' && currentUser?.role !== 'HQ_ADMIN' && currentUser?.role !== 'OWNER' && currentUser?.role !== 'BRANCH_MANAGER') {
      setAdjError('Large write-offs (> 5,000 ETB or > 20 units) require a valid supervisor Manager PIN.');
      return;
    }

    setAdjSubmitting(true);
    try {
      await posApi.createStockAdjustment(
        {
          branch_id: currentUser?.branchId || '018e0000-0000-7000-8000-000000000020',
          reason_code: adjReason,
          notes: adjNotes.trim(),
          approved_by: isLargeWriteOff ? (currentUser?.id || 'supervisor') : undefined,
          manager_pin: managerPin || undefined,
          items: [
            {
              product_id: adjProductId,
              quantity_change: adjQuantity,
              unit_cost: estCost,
            },
          ],
        },
        currentUser?.branchId,
        currentUser?.id,
      );

      setSuccessMsg(
        `Adjustment recorded: ${adjReason} (${adjQuantity > 0 ? `+${adjQuantity}` : adjQuantity} ${targetProduct?.uom_code || 'units'})`,
      );
      setIsAdjModalOpen(false);
      fetchInventory();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setAdjError(err.message || 'Failed to record adjustment');
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleInflowSuccess = (message: string) => {
    setSuccessMsg(message);
    fetchInventory();
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="text-gebeya-600" size={24} />
            {language === 'am' ? 'የእቃ መጋዘን እና መዝገብ' : 'Inventory & Stock Ledger'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የእቃዎች ሚዛን፣ የባች ማብቂያ ጊዜ (FEFO)፣ እና የገባ/የወጣ እቃ መዝገብ'
              : 'Append-only ledger balances, First-Expired First-Out (FEFO) batch tracking & write-offs.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
            title="View past bulk imports and audit log"
          >
            <History size={15} className="text-slate-500" />
            {language === 'am' ? 'የማስመጣት ታሪክ' : 'Import History'}
          </button>

          {/* Primary Add Stock Button */}
          <button
            type="button"
            onClick={() => setIsChooserOpen(true)}
            className="px-4 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <Plus size={16} />
            {language === 'am' ? 'እቃ ጨምር (Add Stock)' : 'Add Stock'}
          </button>
        </div>
      </div>

      {/* ─── KPI Alert Chips ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ጠቅላላ እቃዎች' : 'Tracked Items'}
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
              {totalCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
            <Package size={16} />
          </div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'low_stock' ? 'all' : 'low_stock')}
          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            statusFilter === 'low_stock'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ያለቀባቸው' : 'Low Stock'}
            </div>
            <div className="text-lg font-black text-rose-600 font-mono">{lowCount}</div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
        </div>

        <div
          onClick={() => setStatusFilter(statusFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            statusFilter === 'out_of_stock'
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ያለቁ (ዜሮ)' : 'Out of Stock'}
            </div>
            <div className="text-lg font-black text-slate-700 dark:text-slate-300 font-mono">
              {outCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <X size={16} />
          </div>
        </div>

        <div
          onClick={() => setFefoSort(!fefoSort)}
          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            fefoSort
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'FEFO ቅደም ተከተል' : 'FEFO Expiry Sort'}
            </div>
            <div className="text-xs font-black text-amber-600 font-mono flex items-center gap-1">
              {fefoSort ? 'EARLIEST FIRST' : 'DEFAULT'}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
            <Clock size={16} />
          </div>
        </div>
      </div>

      {/* ─── Success Notification ─── */}
      {successMsg && (
        <div className="p-3.5 mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ─── Filters & Search Toolbar ─── */}
      <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={
              language === 'am'
                ? 'በስም፣ ባርኮድ ወይም SKU ፈልግ...'
                : 'Filter inventory by name, SKU, or barcode...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gebeya-500 font-medium"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-gebeya-500"
        >
          <option value="">{language === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name_en}
            </option>
          ))}
        </select>

        {/* Status Tabs */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('in_stock')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'in_stock'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            In Stock
          </button>
          <button
            onClick={() => setStatusFilter('low_stock')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'low_stock'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Low Stock
          </button>
          <button
            onClick={() => setStatusFilter('out_of_stock')}
            className={`px-3 py-1.5 rounded-lg transition ${
              statusFilter === 'out_of_stock'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Out of Stock
          </button>
        </div>

        {/* Refresh */}
        <button
          onClick={fetchInventory}
          className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
          title="Refresh balances"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ─── Inventory Master Table ─── */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold text-[10px] sticky top-0 backdrop-blur-xs z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5">{language === 'am' ? 'እቃ እና SKU' : 'Product & SKU'}</th>
                <th className="p-3.5">{language === 'am' ? 'ምድብ' : 'Category'}</th>
                <th className="p-3.5 text-right">{language === 'am' ? 'ያለ እቃ መጠን' : 'On Hand (Balance)'}</th>
                <th className="p-3.5 text-center">{language === 'am' ? 'ሁኔታ' : 'Status'}</th>
                <th className="p-3.5 text-right">{language === 'am' ? 'የመሸጫ ዋጋ' : 'Shelf Price'}</th>
                <th className="p-3.5 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span>{language === 'am' ? 'የወጪ ዋጋ' : 'Unit Cost'}</span>
                    {!canViewCost && <Lock size={10} className="text-slate-400" />}
                  </div>
                </th>
                <th className="p-3.5 text-right w-24">{language === 'am' ? 'ተግባራት' : 'Actions'}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-gebeya-600" />
                    Loading inventory ledger balances...
                  </td>
                </tr>
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Package size={36} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    No inventory items match your filter criteria.
                  </td>
                </tr>
              ) : (
                sortedProducts.map((p) => {
                  const onHand = Number(p.stock_on_hand || 0);
                  const minStock = Number(p.min_stock_level || 0);
                  const isOut = onHand <= 0;
                  const isLow = !isOut && onHand <= minStock;
                  const effectivePrice = Number(p.override_price ?? p.base_price);
                  const cost = Number(p.cost_price || 0);

                  return (
                    <tr
                      key={p.id}
                      onClick={() => handleRowClick(p)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition cursor-pointer group"
                    >
                      {/* Product Name & SKU below */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                            <Package size={16} className="text-slate-500" />
                          </div>
                          <div>
                            <div className="font-extrabold text-xs text-slate-900 dark:text-white group-hover:text-gebeya-600 transition-colors flex items-center gap-2">
                              {p.name_en}
                              {p.is_weighed && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                                  SCALE
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              SKU: {p.sku} {p.barcodes?.[0] ? `• ${p.barcodes[0]}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold">
                          {p.category_name || 'General'}
                        </span>
                      </td>

                      {/* On Hand with Unit */}
                      <td className="p-3.5 text-right font-mono">
                        <div
                          className={`text-sm font-black ${
                            isOut
                              ? 'text-slate-400'
                              : isLow
                              ? 'text-rose-600'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {onHand.toFixed(2)} {p.uom_code}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Min: {minStock} {p.uom_code}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="p-3.5 text-center">
                        {isOut ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-bold inline-flex items-center gap-1">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 text-[10px] font-bold inline-flex items-center gap-1">
                            <AlertTriangle size={10} />
                            Low (≤{minStock})
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 text-[10px] font-bold inline-flex items-center gap-1">
                            In Stock
                          </span>
                        )}
                      </td>

                      {/* Shelf Price */}
                      <td className="p-3.5 text-right font-mono font-black text-xs text-gebeya-600 dark:text-gebeya-400">
                        {effectivePrice.toFixed(2)} ETB
                      </td>

                      {/* Unit Cost (Only for permitted roles) */}
                      <td className="p-3.5 text-right font-mono text-xs">
                        {canViewCost ? (
                          <span className="text-slate-700 dark:text-slate-300 font-bold">
                            {cost.toFixed(2)} ETB
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono tracking-widest text-[11px]" title="Cost hidden (permission restricted)">
                            ••••••
                          </span>
                        )}
                      </td>

                      {/* Row Action Drawer Opener */}
                      <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleRowClick(p)}
                            className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-gebeya-50 dark:hover:bg-gebeya-950 text-slate-600 hover:text-gebeya-600 transition"
                            title="Open Ledger & Batches Drawer"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing {sortedProducts.length} of {totalCount} inventory items
          </span>
          <span className="text-[11px] font-mono">
            On Hand = Sum of immutable ledger movements per branch/batch
          </span>
        </div>
      </div>

      {/* ─── Add Stock Chooser Modal (Scan / Manual / Excel) ─── */}
      <AddStockChooserModal
        isOpen={isChooserOpen}
        onClose={() => setIsChooserOpen(false)}
        onSelectScan={() => setIsScanOpen(true)}
        onSelectManual={() => setIsManualOpen(true)}
        onSelectExcel={() => setIsExcelOpen(true)}
        onSelectAdjustment={() => {
          if (products.length > 0) {
            handleOpenAdjustmentForProduct(products[0]);
          }
        }}
        onOpenHistory={() => setIsHistoryOpen(true)}
      />

      {/* ─── Intake Method A: Scan-to-Add Drawer ─── */}
      <ScanStockDrawer
        isOpen={isScanOpen}
        onClose={() => setIsScanOpen(false)}
        onCommitSuccess={handleInflowSuccess}
        existingProducts={products as any}
      />

      {/* ─── Intake Method B: Manual Multi-Line Drawer ─── */}
      <ManualStockDrawer
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        onCommitSuccess={handleInflowSuccess}
        existingProducts={products as any}
      />

      {/* ─── Intake Method C: Excel/CSV Import Modal ─── */}
      <ExcelImportModal
        isOpen={isExcelOpen}
        onClose={() => setIsExcelOpen(false)}
        onCommitSuccess={handleInflowSuccess}
        existingProducts={products as any}
      />

      {/* ─── Import History Modal with Undo Reversals ─── */}
      <ImportHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRevertSuccess={() => fetchInventory()}
      />

      {/* ─── Row Drawer with Ledger Audit Trail & Batches (FEFO View) ─── */}
      <ProductLedgerDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        product={selectedDrawerProduct}
        canViewCost={canViewCost}
        onOpenAdjustment={(p) => {
          setIsDrawerOpen(false);
          handleOpenAdjustmentForProduct(p);
        }}
        onPrintLabel={(p) => {
          handlePrintSingleLabel(p);
        }}
      />

      {/* ─── Barcode Thermal Label Printing Modal ─── */}
      <BarcodeLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        products={selectedForLabels}
      />

      {/* ─── Stock Write-off Adjustment Modal with Large Write-off Approval ─── */}
      {isAdjModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none"
          onClick={(e) => e.target === e.currentTarget && setIsAdjModalOpen(false)}
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center font-bold">
                  <FileEdit size={20} />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    Stock Adjustment / Write-Off
                  </h2>
                  <p className="text-xs text-slate-500">
                    Post damage, shrinkage, expiry loss, or count correction
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAdjModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X size={18} />
              </button>
            </div>

            {adjError && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>{adjError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAdjustment} className="space-y-3.5">
              {/* Product Select */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Select Product *
                </label>
                <select
                  value={adjProductId}
                  onChange={(e) => setAdjProductId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name_en} ({p.sku}) — On Hand: {Number(p.stock_on_hand || 0)} {p.uom_code}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason Code */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Mandatory Reason Code *
                </label>
                <select
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value as StockAdjustmentReasonCode)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                >
                  <option value="DAMAGED_GOODS">DAMAGED_GOODS — Broken jar, dented can, crushed carton</option>
                  <option value="EXPIRED">EXPIRED — Past shelf life / stale perishable</option>
                  <option value="INTERNAL_USE">INTERNAL_USE — Store cleaning, sampling, demo</option>
                  <option value="CORRECTION">CORRECTION — Physical count discrepancy</option>
                  <option value="THEFT">THEFT — Shrinkage / pilferage</option>
                </select>
              </div>

              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Quantity Change (Negative for loss/write-off) *
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">
                    Est. Value: {writeOffValue.toFixed(2)} ETB
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjQuantity || ''}
                  onChange={(e) => setAdjQuantity(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-base font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                />
              </div>

              {/* Audit Explanation */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Audit Notes / Reason Explanation *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Dropped jar during aisle stocking, package torn in delivery"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gebeya-500"
                />
              </div>

              {/* Large Write-Off Supervisor Approval Requirement */}
              {isLargeWriteOff && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 space-y-2 animate-in fade-in">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                    <ShieldAlert size={16} className="text-amber-600" />
                    Large Write-Off Supervisor Approval Required
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                    Adjustments exceeding 20 units or 5,000 ETB loss ({writeOffValue.toFixed(2)} ETB) require manager PIN authorization.
                  </p>
                  <div>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="Enter Supervisor PIN (1234)..."
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-xs font-mono font-bold tracking-widest text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adjSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {adjSubmitting && <RefreshCw size={14} className="animate-spin" />}
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
