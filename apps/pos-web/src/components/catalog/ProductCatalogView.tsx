import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Printer,
  Edit2,
  Tag,
  Filter,
  Check,
  AlertTriangle,
  RefreshCw,
  Scale,
  Percent,
  X,
  Package,
  FolderPlus,
  UploadCloud,
  Download,
  History,
  Archive,
  Layers,
  CheckSquare,
  Square,
  AlertCircle,
  Copy,
  ExternalLink,
  DollarSign,
  ChevronRight,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../utils/pos-api';
import { BarcodeLabelModal, LabelProductItem } from './BarcodeLabelModal';
import { ProductDrawer, ProductDrawerData } from './ProductDrawer';
import { CategoryManagerModal } from './CategoryManagerModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { CatalogImportModal } from './CatalogImportModal';

interface ProductItem {
  id: string;
  sku: string;
  name_en: string;
  name_am?: string | null;
  category_id: string;
  category_name?: string;
  category_name_am?: string | null;
  uom_code: string;
  base_price: string | number;
  cost_price: string | number;
  override_price?: string | number | null;
  override_vat_applicable?: boolean | null;
  override_vat_rate?: string | number | null;
  is_vat_applicable: boolean;
  vat_rate: string | number;
  is_weighed: boolean;
  scale_plu?: string | null;
  min_stock_level: string | number;
  max_stock_level?: string | number | null;
  allow_discount: boolean;
  is_active: boolean;
  stock_on_hand?: string | number;
  barcodes?: string[];
  image_url?: string;
}

interface CategoryOption {
  id: string;
  code: string;
  name_en: string;
  name_am?: string | null;
  product_count?: number | string;
}

interface UomOption {
  code: string;
  name_en: string;
}

export const ProductCatalogView: React.FC = () => {
  const { t, language } = useI18n();
  const { hasPermission, currentUser } = useAuth();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [lowStockFilter, setLowStockFilter] = useState<boolean>(false);

  // Selection for Bulk Toolbar
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerProduct, setDrawerProduct] = useState<ProductDrawerData | null>(null);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [historyProduct, setHistoryProduct] = useState<ProductItem | null>(null);

  const [isLabelModalOpen, setIsLabelModalOpen] = useState<boolean>(false);
  const [selectedForLabels, setSelectedForLabels] = useState<LabelProductItem[]>([]);

  // Archive Confirmation with Stock Warning Modal
  const [archiveTarget, setArchiveTarget] = useState<ProductItem | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  // Bulk Category Assignment dropdown
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>('');
  const [isBulkCategoryOpen, setIsBulkCategoryOpen] = useState<boolean>(false);

  const fetchDropdowns = async () => {
    try {
      const [catRes, uomRes] = await Promise.all([
        fetch('/api/products/categories'),
        fetch('/api/products/uoms'),
      ]);
      if (catRes.ok) setCategories(await catRes.json());
      if (uomRes.ok) setUoms(await uomRes.json());
    } catch (err) {
      console.error('Failed to load categories/uoms', err);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const activeParam =
        statusFilter === 'all' ? undefined : statusFilter === 'active';

      const data = await posApi.getCatalogProducts({
        search: search.trim() || undefined,
        category_id: selectedCategory || undefined,
        active_only: activeParam,
        low_stock_only: lowStockFilter,
        limit: 150,
      });

      setProducts(data.rows || []);
      setTotalCount(data.total || (data.rows ? data.rows.length : 0));
    } catch (err) {
      console.error('Failed to fetch products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchProducts, 250);
    return () => clearTimeout(timer);
  }, [search, selectedCategory, statusFilter, lowStockFilter]);

  // Bulk selection helpers
  const handleToggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  // Open Add Drawer (<30s)
  const handleOpenAdd = () => {
    setDrawerProduct(null);
    setIsDrawerOpen(true);
  };

  // Open Edit Drawer
  const handleOpenEdit = (p: ProductItem) => {
    const drawerData: ProductDrawerData = {
      id: p.id,
      sku: p.sku,
      name_en: p.name_en,
      name_am: p.name_am,
      category_id: p.category_id,
      uom_code: p.uom_code,
      base_price: Number(p.base_price),
      cost_price: Number(p.cost_price),
      branch_override_price: p.override_price !== null && p.override_price !== undefined ? Number(p.override_price) : null,
      is_vat_applicable: p.is_vat_applicable,
      vat_rate: Number(p.vat_rate),
      is_weighed: p.is_weighed,
      scale_plu: p.scale_plu,
      min_stock_level: Number(p.min_stock_level),
      max_stock_level: p.max_stock_level ? Number(p.max_stock_level) : 50,
      allow_discount: p.allow_discount,
      is_active: p.is_active,
      barcode: p.barcodes?.[0] || '',
      image_url: p.image_url,
      stock_on_hand: Number(p.stock_on_hand || 0),
    };
    setDrawerProduct(drawerData);
    setIsDrawerOpen(true);
  };

  // Archive / Soft Delete with Stock Warning
  const handleInitiateArchive = (p: ProductItem) => {
    const stock = Number(p.stock_on_hand || 0);
    setArchiveTarget(p);

    if (p.is_active) {
      if (stock > 0) {
        setArchiveWarning(
          `Product has ${stock} ${p.uom_code} in stock on hand. Archiving will remove it from the active POS cashier register while inventory remains on the ledger!`,
        );
      } else {
        setArchiveWarning(null);
      }
    } else {
      setArchiveWarning(null);
    }

    setIsArchiveModalOpen(true);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setActionInProgress(true);
    try {
      if (archiveTarget.is_active) {
        // Archive (soft delete)
        await posApi.archiveProduct(archiveTarget.id, currentUser?.branchId);
      } else {
        // Unarchive / restore
        await posApi.updateProduct(archiveTarget.id, { is_active: true });
      }
      setIsArchiveModalOpen(false);
      setArchiveTarget(null);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionInProgress(false);
    }
  };

  // Bulk Actions
  const handleBulkPrintLabels = () => {
    const selected = products.filter((p) => selectedIds.includes(p.id));
    const items: LabelProductItem[] = selected.map((p) => ({
      id: p.id,
      sku: p.sku,
      barcode: p.barcodes?.[0] || p.sku,
      nameEn: p.name_en,
      nameAm: p.name_am,
      sellingPrice: Number(p.override_price ?? p.base_price),
      isVatApplicable: p.is_vat_applicable,
    }));
    setSelectedForLabels(items);
    setIsLabelModalOpen(true);
  };

  const handleBulkArchive = async (archive: boolean) => {
    if (selectedIds.length === 0) return;
    const confirmMsg = archive
      ? `Are you sure you want to archive ${selectedIds.length} selected products?`
      : `Are you sure you want to activate ${selectedIds.length} selected products?`;

    if (!window.confirm(confirmMsg)) return;

    setActionInProgress(true);
    try {
      await posApi.bulkArchiveProducts(selectedIds, archive);
      setSelectedIds([]);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Bulk archive failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleBulkApplyCategory = async () => {
    if (!bulkCategoryTarget || selectedIds.length === 0) return;
    setActionInProgress(true);
    try {
      await posApi.bulkUpdateCategory(selectedIds, bulkCategoryTarget);
      setIsBulkCategoryOpen(false);
      setSelectedIds([]);
      fetchProducts();
    } catch (err: any) {
      alert(err.message || 'Bulk category update failed');
    } finally {
      setActionInProgress(false);
    }
  };

  // CSV Export (Full or Selected)
  const handleExportCsv = (onlySelected = false) => {
    const listToExport = onlySelected
      ? products.filter((p) => selectedIds.includes(p.id))
      : products;

    if (listToExport.length === 0) {
      alert('No products to export.');
      return;
    }

    const headers = [
      'Barcode',
      'SKU',
      'Name (EN)',
      'Name (AM)',
      'Category',
      'Unit',
      'Cost Price',
      'HQ Base Price',
      'Branch Override Price',
      'VAT Applicable',
      'VAT Rate',
      'Stock On Hand',
      'Status',
    ];

    const rows = listToExport.map((p) => [
      `"${p.barcodes?.[0] || ''}"`,
      `"${p.sku}"`,
      `"${p.name_en.replace(/"/g, '""')}"`,
      `"${(p.name_am || '').replace(/"/g, '""')}"`,
      `"${p.category_name || ''}"`,
      `"${p.uom_code}"`,
      Number(p.cost_price).toFixed(2),
      Number(p.base_price).toFixed(2),
      p.override_price !== null && p.override_price !== undefined ? Number(p.override_price).toFixed(2) : '',
      p.is_vat_applicable ? 'YES' : 'NO',
      `${(Number(p.vat_rate) * 100).toFixed(0)}%`,
      Number(p.stock_on_hand || 0).toString(),
      p.is_active ? 'ACTIVE' : 'ARCHIVED',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `gebeyaos_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick stats computed
  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => Number(p.stock_on_hand || 0) <= Number(p.min_stock_level)).length,
    [products],
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Tag className="text-gebeya-600" size={24} />
            {language === 'am' ? 'የእቃዎች ካታሎግ እና ዋጋ' : 'Product Master Catalog'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የእቃዎች ዝርዝር፣ የዋጋ ማስተካከያ፣ ምድቦች፣ እና የባርኮድ መለያ ማተሚያ'
              : 'HQ-authoritative product catalog, branch overrides, category management & thermal labels.'}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <FolderPlus size={15} className="text-gebeya-600" />
            {language === 'am' ? 'ምድቦች' : 'Categories'}
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <UploadCloud size={15} className="text-indigo-600" />
            {language === 'am' ? 'ማስመጣት (Import)' : 'Import'}
          </button>

          <button
            onClick={() => handleExportCsv(false)}
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <Download size={15} className="text-slate-600" />
            {language === 'am' ? 'ማውጣት (Export)' : 'Export CSV'}
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-gebeya-600 hover:bg-gebeya-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition active:scale-95"
          >
            <Plus size={16} />
            {language === 'am' ? 'አዲስ እቃ መዝግብ (30s)' : '+ Add Product (30s)'}
          </button>
        </div>
      </div>

      {/* 2. Stats Bar & KPI Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ጠቅላላ እቃዎች' : 'Total Catalog'}
            </div>
            <div className="text-lg font-black text-slate-900 dark:text-white font-mono">
              {totalCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center">
            <Package size={16} />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ንቁ እቃዎች' : 'Active Products'}
            </div>
            <div className="text-lg font-black text-emerald-600 font-mono">
              {activeCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
            <Check size={16} />
          </div>
        </div>

        <div
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            lowStockFilter
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ያለቀባቸው እቃዎች' : 'Low Stock Alerts'}
            </div>
            <div className="text-lg font-black text-rose-600 font-mono">
              {lowStockCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
            <AlertTriangle size={16} />
          </div>
        </div>

        <div
          onClick={() => setIsCategoryModalOpen(true)}
          className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-gebeya-300 transition cursor-pointer flex items-center justify-between"
        >
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {language === 'am' ? 'ምድቦች' : 'Categories'}
            </div>
            <div className="text-lg font-black text-indigo-600 font-mono">
              {categories.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
            <FolderPlus size={16} />
          </div>
        </div>
      </div>

      {/* 3. Search and Multi-Filter Bar */}
      <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            placeholder={
              language === 'am'
                ? 'በስም፣ ባርኮድ ወይም SKU ፈልግ...'
                : 'Search by product name, barcode, or SKU...'
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

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-gebeya-500"
          >
            <option value="">{language === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
              </option>
            ))}
          </select>

          {/* Status Tabs */}
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'active'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Active
            </button>
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
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 rounded-lg transition ${
                statusFilter === 'archived'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Archived
            </button>
          </div>

          {/* Low Stock Toggle Pill */}
          <button
            onClick={() => setLowStockFilter(!lowStockFilter)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              lowStockFilter
                ? 'bg-rose-500 border-rose-500 text-white'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <AlertTriangle size={13} />
            Low Stock
          </button>

          {/* Refresh */}
          <button
            onClick={fetchProducts}
            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 4. Bulk Edit Toolbar (Appears when >= 1 item selected) */}
      {selectedIds.length > 0 && (
        <div className="mb-4 p-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-gebeya-500 text-slate-950 font-black text-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-slate-200">
              {selectedIds.length} product(s) selected
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkPrintLabels}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition text-cyan-400"
            >
              <Printer size={14} />
              Print Labels
            </button>

            {/* Change Category Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setIsBulkCategoryOpen(!isBulkCategoryOpen)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition text-indigo-400"
              >
                <FolderPlus size={14} />
                Change Category
              </button>

              {isBulkCategoryOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 z-50 text-slate-900 dark:text-white animate-in fade-in">
                  <div className="text-xs font-bold mb-2">Assign Category:</div>
                  <select
                    value={bulkCategoryTarget}
                    onChange={(e) => setBulkCategoryTarget(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs mb-3 font-semibold"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_en}
                      </option>
                    ))}
                  </select>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsBulkCategoryOpen(false)}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkApplyCategory}
                      disabled={!bulkCategoryTarget || actionInProgress}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => handleBulkArchive(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Archive size={14} />
              Archive Selected
            </button>

            <button
              onClick={() => handleExportCsv(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 transition text-slate-300"
            >
              <Download size={14} />
              Export Selected
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 5. Product Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            {/* Table Header */}
            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold text-[10px] sticky top-0 backdrop-blur-xs z-10 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                  >
                    {products.length > 0 && selectedIds.length === products.length ? (
                      <CheckSquare size={16} className="text-gebeya-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="p-3.5">{language === 'am' ? 'እቃ / SKU' : 'Product & SKU'}</th>
                <th className="p-3.5">{language === 'am' ? 'ባርኮድ' : 'Barcodes'}</th>
                <th className="p-3.5">{language === 'am' ? 'ምድብ' : 'Category'}</th>
                <th className="p-3.5">{language === 'am' ? 'መለኪያ' : 'UOM'}</th>
                <th className="p-3.5 text-right">{language === 'am' ? 'የመሸጫ ዋጋ' : 'Selling Price (HQ / Override)'}</th>
                <th className="p-3.5 text-center">{language === 'am' ? 'ተ.እ.ታ' : 'VAT Type'}</th>
                <th className="p-3.5 text-right">{language === 'am' ? 'ያለ እቃ መጠን' : 'Stock on Hand'}</th>
                <th className="p-3.5 text-center">{language === 'am' ? 'ሁኔታ' : 'Status'}</th>
                <th className="p-3.5 text-right w-28">{language === 'am' ? 'ተግባራት' : 'Actions'}</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-gebeya-600" />
                    Loading product catalog...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-slate-400">
                    <Package size={36} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
                    No products found matching your search and filter criteria.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const basePrice = Number(p.base_price);
                  const hasOverride = p.override_price !== null && p.override_price !== undefined;
                  const overridePrice = hasOverride ? Number(p.override_price) : null;
                  const stock = Number(p.stock_on_hand || 0);
                  const minStock = Number(p.min_stock_level || 0);
                  const isLowStock = stock <= minStock;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition group ${
                        isSelected ? 'bg-gebeya-50/40 dark:bg-gebeya-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center">
                        <button
                          onClick={() => handleToggleSelectRow(p.id)}
                          className="text-slate-400 hover:text-slate-600 transition"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-gebeya-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>

                      {/* Product Name, Image & SKU */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          {/* Image thumbnail */}
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name_en}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="font-black text-xs text-slate-400">
                                {p.name_en.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center gap-2">
                              {p.name_en}
                              {p.is_weighed && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                                  PLU: {p.scale_plu || 'SCALE'}
                                </span>
                              )}
                            </div>
                            {p.name_am && (
                              <div className="text-[11px] text-slate-500 font-sans">
                                {p.name_am}
                              </div>
                            )}
                            <div className="text-[10px] font-mono text-slate-400">
                              SKU: {p.sku}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Barcodes */}
                      <td className="p-3.5">
                        {p.barcodes && p.barcodes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {p.barcodes.map((bc, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[10px] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                              >
                                {bc}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-mono">—</span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold border border-slate-200 dark:border-slate-700">
                          {p.category_name || 'General'}
                        </span>
                      </td>

                      {/* UOM */}
                      <td className="p-3.5">
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                          {p.uom_code}
                        </span>
                      </td>

                      {/* Selling Price (HQ base price vs Branch Override) */}
                      <td className="p-3.5 text-right">
                        {hasOverride ? (
                          <div>
                            <div className="font-mono text-xs font-black text-cyan-600 dark:text-cyan-400">
                              {overridePrice?.toFixed(2)} ETB
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono line-through">
                              HQ: {basePrice.toFixed(2)} ETB
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                              Branch Override
                            </span>
                          </div>
                        ) : (
                          <div className="font-mono text-xs font-black text-slate-900 dark:text-white">
                            {basePrice.toFixed(2)} ETB
                          </div>
                        )}
                      </td>

                      {/* VAT Type */}
                      <td className="p-3.5 text-center">
                        {p.is_vat_applicable ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            Type A 15%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                            Type B Exempt
                          </span>
                        )}
                      </td>

                      {/* Stock on Hand */}
                      <td className="p-3.5 text-right">
                        <div className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">
                          {stock.toFixed(2)}
                        </div>
                        {isLowStock && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-600">
                            Low Stock (≤{minStock})
                          </span>
                        )}
                      </td>

                      {/* Active Status */}
                      <td className="p-3.5 text-center">
                        {p.is_active ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 text-[10px] font-bold">
                            Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-bold">
                            Archived
                          </span>
                        )}
                      </td>

                      {/* Row Action Buttons */}
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                          {/* Edit (Opens Drawer) */}
                          <button
                            title="Edit Product"
                            onClick={() => handleOpenEdit(p)}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-gebeya-100 dark:hover:bg-gebeya-950 text-slate-600 dark:text-slate-300 hover:text-gebeya-600 flex items-center justify-center transition"
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Print Label */}
                          <button
                            title="Print Thermal Barcode Label"
                            onClick={() => {
                              setSelectedForLabels([
                                {
                                  id: p.id,
                                  sku: p.sku,
                                  barcode: p.barcodes?.[0] || p.sku,
                                  nameEn: p.name_en,
                                  nameAm: p.name_am,
                                  sellingPrice: Number(p.override_price ?? p.base_price),
                                  isVatApplicable: p.is_vat_applicable,
                                },
                              ]);
                              setIsLabelModalOpen(true);
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-cyan-100 dark:hover:bg-cyan-950 text-slate-600 dark:text-slate-300 hover:text-cyan-600 flex items-center justify-center transition"
                          >
                            <Printer size={13} />
                          </button>

                          {/* Price History */}
                          <button
                            title="View Price History & Logs"
                            onClick={() => {
                              setHistoryProduct(p);
                              setIsHistoryModalOpen(true);
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-amber-950 text-slate-600 dark:text-slate-300 hover:text-amber-600 flex items-center justify-center transition"
                          >
                            <History size={13} />
                          </button>

                          {/* Archive / Restore */}
                          <button
                            title={p.is_active ? 'Archive Product' : 'Restore Product'}
                            onClick={() => handleInitiateArchive(p)}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition ${
                              p.is_active
                                ? 'bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950 text-slate-600 hover:text-rose-600'
                                : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                            }`}
                          >
                            <Archive size={13} />
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
            Showing {products.length} of {totalCount} items
          </span>
          <span className="text-[11px]">
            GebeyaOS Master Catalog • Synced with Sync Outbox
          </span>
        </div>
      </div>

      {/* Slide-over Add/Edit Product Drawer */}
      <ProductDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        product={drawerProduct}
        categories={categories}
        uoms={uoms}
        onSaved={() => {
          fetchProducts();
          fetchDropdowns();
        }}
        onOpenCategoryManager={() => setIsCategoryModalOpen(true)}
      />

      {/* Category Management Modal */}
      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        onCategoryCreated={(newCat) => {
          setCategories((prev) => [...prev, newCat]);
          fetchDropdowns();
        }}
      />

      {/* Price Change Log Modal */}
      <PriceHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        product={historyProduct}
        onPriceUpdated={fetchProducts}
      />

      {/* Excel / CSV Import Modal */}
      <CatalogImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportCompleted={() => {
          fetchProducts();
          fetchDropdowns();
        }}
      />

      {/* Barcode Thermal Label Printing Modal */}
      <BarcodeLabelModal
        isOpen={isLabelModalOpen}
        onClose={() => setIsLabelModalOpen(false)}
        products={selectedForLabels}
      />

      {/* Archive Confirmation with Stock Warning Modal */}
      {isArchiveModalOpen && archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold ${
                  archiveWarning
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600'
                }`}
              >
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {archiveTarget.is_active ? 'Archive Product' : 'Restore Product'}
                </h3>
                <p className="text-xs text-slate-500">{archiveTarget.name_en}</p>
              </div>
            </div>

            {archiveWarning ? (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle size={15} />
                  Stock on Hand Warning
                </div>
                <p>{archiveWarning}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {archiveTarget.is_active
                  ? 'Archiving will deactivate this product and hide it from the active POS register. You can restore it anytime.'
                  : 'Restoring this product will activate it and make it immediately searchable on POS cashier terminals.'}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={actionInProgress}
                onClick={handleConfirmArchive}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs ${
                  archiveTarget.is_active
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {actionInProgress && <RefreshCw size={13} className="animate-spin" />}
                {archiveTarget.is_active ? 'Proceed to Archive' : 'Restore Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
