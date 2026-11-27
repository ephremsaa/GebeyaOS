import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  MoreVertical,
  Lock,
  RotateCcw,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { useBrand } from '../../brand/BrandContext';
import { posApi } from '../../utils/pos-api';
import { BarcodeLabelModal, LabelProductItem } from './BarcodeLabelModal';
import { ProductDrawer, ProductDrawerData } from './ProductDrawer';
import { CategoryManagerModal } from './CategoryManagerModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { CatalogImportModal } from './CatalogImportModal';
import { StockAdjustmentModal } from '../inventory/StockAdjustmentModal';

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
  photo_path?: string | null;
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
  const brand = useBrand();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Active View Tab on Items Page
  const [activeViewTab, setActiveViewTab] = useState<'items' | 'categories'>('items');

  // Category Management State (Inline on page)
  const [newCatNameEn, setNewCatNameEn] = useState('');
  const [newCatNameAm, setNewCatNameAm] = useState('');
  const [newCatCode, setNewCatCode] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [catSuccess, setCatSuccess] = useState<string | null>(null);

  // Rename Category State
  const [renamingCategory, setRenamingCategory] = useState<CategoryOption | null>(null);
  const [renameNameEn, setRenameNameEn] = useState('');
  const [renameNameAm, setRenameNameAm] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

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

  // Stock Adjustment & Write-off Modal (Merged into Items)
  const [adjustTarget, setAdjustTarget] = useState<ProductItem | null>(null);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState<boolean>(false);

  // Archive Confirmation with Stock Warning Modal
  const [archiveTarget, setArchiveTarget] = useState<ProductItem | null>(null);
  const [archiveWarning, setArchiveWarning] = useState<string | null>(null);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  // Bulk Category Assignment dropdown
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState<string>('');
  const [isBulkCategoryOpen, setIsBulkCategoryOpen] = useState<boolean>(false);

  // Part 4: Inline Table Editing State
  const [editingCell, setEditingCell] = useState<{
    productId: string;
    field: 'name_en' | 'base_price' | 'min_stock_level';
    value: string;
  } | null>(null);

  // Green flash animation on save
  const [flashCell, setFlashCell] = useState<{ productId: string; field: string } | null>(null);

  // 8-Second Undo Toast State
  const [undoToast, setUndoToast] = useState<{
    productId: string;
    field: 'name_en' | 'base_price' | 'min_stock_level';
    oldValue: any;
    newValue: any;
    productName: string;
  } | null>(null);
  const undoTimeoutRef = useRef<any>(null);

  // Row dropdown menu state
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);

  // Delete Modals & Actions
  const [deleteTarget, setDeleteTarget] = useState<ProductItem | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState<boolean>(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState<boolean>(false);
  const [deleteAllConfirmInput, setDeleteAllConfirmInput] = useState<string>('');
  const [deleteNotice, setDeleteNotice] = useState<{ message: string; type: 'success' | 'warning' } | null>(null);

  // Quick chip: Needs Attention (Missing barcode, Out of stock, Selling below cost)
  const [needsAttentionFilter, setNeedsAttentionFilter] = useState<boolean>(false);

  // Role authority checks
  const isCashier = currentUser?.role === 'CASHIER';
  const canEditCatalog =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'STORE_OWNER' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'STOREKEEPER' ||
    hasPermission('catalog:product:manage');
  const canEditPrice =
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'STORE_OWNER' ||
    currentUser?.role === 'BRANCH_MANAGER' ||
    hasPermission('pricing.override');

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

  // Count items needing attention (Part 4)
  const needsAttentionCount = useMemo(() => {
    return products.filter((p) => {
      const noBarcode = !p.barcodes || p.barcodes.length === 0 || p.barcodes[0] === '';
      const outOfStock = Number(p.stock_on_hand || 0) <= 0;
      const negativeMargin = Number(p.cost_price || 0) > Number(p.base_price || 0);
      return noBarcode || outOfStock || negativeMargin;
    }).length;
  }, [products]);

  // Enhanced search and filter pipeline (Part 4: Typo-tolerant multi-word matching)
  const displayProducts = useMemo(() => {
    let list = products;

    if (needsAttentionFilter) {
      list = list.filter((p) => {
        const noBarcode = !p.barcodes || p.barcodes.length === 0 || p.barcodes[0] === '';
        const outOfStock = Number(p.stock_on_hand || 0) <= 0;
        const negativeMargin = Number(p.cost_price || 0) > Number(p.base_price || 0);
        return noBarcode || outOfStock || negativeMargin;
      });
    }

    if (!search.trim()) return list;

    const tokens = search.toLowerCase().trim().split(/\s+/);
    return list.filter((p) => {
      const haystack = [
        p.name_en || '',
        p.name_am || '',
        p.sku || '',
        p.category_name || '',
        ...(p.barcodes || []),
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [products, needsAttentionFilter, search]);

  // Closest item name suggestion if no matches found (Part 4)
  const searchSuggestion = useMemo(() => {
    if (!search.trim() || displayProducts.length > 0 || products.length === 0) return null;
    const q = search.toLowerCase().trim();
    for (const p of products) {
      const name = (p.name_en || '').toLowerCase();
      if (q.length >= 2 && (name.includes(q.slice(0, 2)) || name.includes(q.slice(-2)))) {
        return p.name_en;
      }
    }
    return products[0]?.name_en || null;
  }, [search, displayProducts, products]);

  // Inline edit commit (Part 4)
  const handleSaveInline = async (
    productId: string,
    field: 'name_en' | 'base_price' | 'min_stock_level',
    rawValue: string,
  ) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setEditingCell(null);
      return;
    }

    let parsedVal: any = rawValue.trim();
    if (field === 'base_price') {
      parsedVal = parseFloat(rawValue);
      if (isNaN(parsedVal) || parsedVal < 0) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'min_stock_level') {
      parsedVal = parseInt(rawValue, 10);
      if (isNaN(parsedVal) || parsedVal < 0) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'name_en') {
      if (!parsedVal) {
        setEditingCell(null);
        return;
      }
    }

    const oldValue = (product as any)[field];
    if (oldValue === parsedVal) {
      setEditingCell(null);
      return;
    }

    try {
      await posApi.updateProduct(productId, { [field]: parsedVal });
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, [field]: parsedVal } : p)),
      );

      // Green flash animation
      setFlashCell({ productId, field });
      setTimeout(() => setFlashCell(null), 1000);

      // 8-second undo toast
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setUndoToast({
        productId,
        field,
        oldValue,
        newValue: parsedVal,
        productName: product.name_en,
      });
      undoTimeoutRef.current = setTimeout(() => {
        setUndoToast(null);
      }, 8000);
    } catch (err: any) {
      console.error('Failed inline update', err);
    } finally {
      setEditingCell(null);
    }
  };

  // Undo action (Part 4)
  const handleUndo = async () => {
    if (!undoToast) return;
    const { productId, field, oldValue } = undoToast;
    try {
      await posApi.updateProduct(productId, { [field]: oldValue });
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, [field]: oldValue } : p)),
      );
      setFlashCell({ productId, field });
      setTimeout(() => setFlashCell(null), 1000);
    } catch (err) {
      console.error('Undo failed', err);
    } finally {
      setUndoToast(null);
    }
  };

  // Duplicate product (Part 4)
  const handleDuplicate = (p: ProductItem) => {
    const drawerData: ProductDrawerData = {
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      name_en: `${p.name_en} - COPY`,
      name_am: p.name_am ? `${p.name_am} - ቅጂ` : '',
      category_id: p.category_id,
      uom_code: p.uom_code,
      base_price: Number(p.base_price),
      cost_price: Number(p.cost_price),
      branch_override_price: null,
      is_vat_applicable: p.is_vat_applicable,
      vat_rate: Number(p.vat_rate),
      is_weighed: p.is_weighed,
      scale_plu: '',
      min_stock_level: Number(p.min_stock_level),
      max_stock_level: p.max_stock_level ? Number(p.max_stock_level) : 50,
      allow_discount: p.allow_discount,
      is_active: true,
      barcode: '', // Clear barcode for copy
      image_url: p.image_url,
      photo_path: p.photo_path || null,
      stock_on_hand: 0,
    };
    setDrawerProduct(drawerData);
    setIsDrawerOpen(true);
  };

  // Bulk Change VAT (Part 4)
  const handleBulkChangeVat = async (vatApplicable: boolean) => {
    if (selectedIds.length === 0) return;
    setActionInProgress(true);
    try {
      for (const id of selectedIds) {
        await posApi.updateProduct(id, {
          is_vat_applicable: vatApplicable,
          vat_rate: vatApplicable ? 0.15 : 0,
        });
      }
      setProducts((prev) =>
        prev.map((p) =>
          selectedIds.includes(p.id)
            ? { ...p, is_vat_applicable: vatApplicable, vat_rate: vatApplicable ? 0.15 : 0 }
            : p,
        ),
      );
      setSelectedIds([]);
    } catch (err: any) {
      alert(err.message || 'Bulk VAT update failed');
    } finally {
      setActionInProgress(false);
    }
  };
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
      photo_path: p.photo_path || null,
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

  // Single Delete
  const handleInitiateDeleteSingle = (p: ProductItem) => {
    setDeleteTarget(p);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteSingle = async () => {
    if (!deleteTarget) return;
    setActionInProgress(true);
    try {
      const res = await posApi.deleteProduct(deleteTarget.id, true);
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      if (res?.mode === 'soft') {
        setDeleteNotice({
          message: language === 'am'
            ? 'እቃው ቀደም ሲል የተመዘገበ ሽያጭ ስላለው የፋይናንስ ታሪክን ለመጠበቅ ደብቋል (Archived)።'
            : 'Item has recorded sales; it was archived and deactivated instead of deleted to protect fiscal audit history.',
          type: 'warning',
        });
      } else {
        setDeleteNotice({
          message: language === 'am' ? 'እቃው በተሳካ ሁኔታ ተሰርዟል!' : 'Product deleted successfully!',
          type: 'success',
        });
      }
      fetchProducts();
      fetchDropdowns();
    } catch (err: any) {
      alert(err.message || 'Failed to delete product');
    } finally {
      setActionInProgress(false);
    }
  };

  // Bulk Delete
  const handleInitiateBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setIsBulkDeleteModalOpen(true);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setActionInProgress(true);
    try {
      const res = await posApi.bulkDeleteProducts(selectedIds, true);
      setIsBulkDeleteModalOpen(false);
      setSelectedIds([]);
      setDeleteNotice({
        message: language === 'am'
          ? `የተሰረዙ፡ ${res.hardDeleted}፣ የተደበቁ (ሽያጭ ያላቸው)፡ ${res.softDeleted}`
          : `Bulk delete complete: ${res.hardDeleted} deleted permanently, ${res.softDeleted} archived (had sales).`,
        type: 'success',
      });
      fetchProducts();
      fetchDropdowns();
    } catch (err: any) {
      alert(err.message || 'Failed to bulk delete products');
    } finally {
      setActionInProgress(false);
    }
  };

  // Delete All / Clear Catalog
  const handleInitiateDeleteAll = () => {
    setDeleteAllConfirmInput('');
    setIsDeleteAllModalOpen(true);
  };

  const handleConfirmDeleteAll = async () => {
    const val = deleteAllConfirmInput.trim().toUpperCase();
    if (val !== 'DELETE ALL' && val !== 'ሰርዝ' && val !== 'አጥፋ') {
      alert(language === 'am' ? 'እባክዎ በትክክል "DELETE ALL" ወይም "ሰርዝ" ብለው ይጻፉ' : 'Please type "DELETE ALL" exactly to confirm.');
      return;
    }
    setActionInProgress(true);
    try {
      const res = await posApi.deleteAllProducts('DELETE ALL');
      setIsDeleteAllModalOpen(false);
      setDeleteAllConfirmInput('');
      setSelectedIds([]);
      setDeleteNotice({
        message: language === 'am'
          ? `ካታሎግ ፀድቷል፡ ${res.hardDeleted} እቃዎች በቋሚነት ተሰርዘዋል፣ ${res.softDeleted} እቃዎች ተደብቀዋል (ሽያጭ ስላላቸው)።`
          : `Catalog cleared: ${res.hardDeleted} deleted permanently, ${res.softDeleted} archived (had sales).`,
        type: 'success',
      });
      fetchProducts();
      fetchDropdowns();
    } catch (err: any) {
      alert(err.message || 'Failed to clear catalog');
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
    const brandSlug = (brand.displayName || 'items').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    link.setAttribute('download', `${brandSlug}_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Colored initial generator for items without image
  const getInitialColor = (name: string) => {
    const palette = [
      { bg: 'bg-primary-soft/60', text: 'text-emerald-700 dark:text-emerald-300' },
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

  // Toggle active status without deleting product
  const handleToggleActive = async (p: ProductItem) => {
    try {
      const nextActive = !p.is_active;
      await posApi.updateProduct(p.id, { is_active: nextActive });
      setProducts((prev) =>
        prev.map((item) => (item.id === p.id ? { ...item, is_active: nextActive } : item)),
      );
    } catch (err: any) {
      console.error('Failed to toggle status', err);
    }
  };

  // Create Category (inline form on page)
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    setCatSuccess(null);
    if (!newCatNameEn.trim()) {
      setCatError(t('catalog.englishNameRequired'));
      return;
    }
    const catCode = (newCatCode.trim() || newCatNameEn.trim().toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 16));
    setCatSaving(true);
    try {
      const created = await posApi.createCategory({
        code: catCode,
        name_en: newCatNameEn.trim(),
        name_am: newCatNameAm.trim() || undefined,
      });
      setNewCatCode('');
      setNewCatNameEn('');
      setNewCatNameAm('');
      setCatSuccess(t('catalog.categoryCreated'));
      await fetchDropdowns();
    } catch (err: any) {
      setCatError(err.message || 'Failed to create category');
    } finally {
      setCatSaving(false);
    }
  };

  // Archive Category (prevented if active items exist)
  const handleArchiveCategory = async (cat: CategoryOption) => {
    setCatError(null);
    setCatSuccess(null);
    const count = Number(cat.product_count || 0);
    if (count > 0) {
      setCatError(
        t('catalog.cannotArchiveCategoryWithItems', {
          name: cat.name_en,
          count,
        }),
      );
      return;
    }
    try {
      await posApi.archiveCategory(cat.id);
      setCatSuccess(`Category "${cat.name_en}" archived successfully.`);
      await fetchDropdowns();
    } catch (err: any) {
      setCatError(err.message || 'Failed to archive category');
    }
  };

  // Save Renamed Category
  const handleSaveRename = async () => {
    if (!renamingCategory) return;
    setCatError(null);
    if (!renameNameEn.trim()) {
      setCatError(t('catalog.englishNameRequired'));
      return;
    }
    setRenameSaving(true);
    try {
      await posApi.updateCategory(renamingCategory.id, {
        name_en: renameNameEn.trim(),
        name_am: renameNameAm.trim() || undefined,
      });
      setRenamingCategory(null);
      setCatSuccess('Category renamed successfully.');
      await fetchDropdowns();
    } catch (err: any) {
      setCatError(err.message || 'Failed to rename category');
    } finally {
      setRenameSaving(false);
    }
  };

  // Quick stats computed
  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);
  const lowStockCount = useMemo(
    () => products.filter((p) => Number(p.stock_on_hand || 0) <= Number(p.min_stock_level)).length,
    [products],
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-page p-4 sm:p-6 overflow-hidden select-none text-text-main">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-text-main flex items-center gap-2.5 tracking-tight">
              <Package className="text-primary" size={24} />
              {t('catalog.itemsPageTitle')}
            </h1>
            <p className="text-[14px] text-text-muted mt-0.5">
              {t('catalog.itemsPageSubtitle')}
            </p>
          </div>

          {/* View Tab Switcher: All Items vs Categories */}
          <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-border-subtle self-start">
            <button
              type="button"
              onClick={() => setActiveViewTab('items')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeViewTab === 'items'
                  ? 'bg-white dark:bg-surface-2 text-text-main shadow-xs'
                  : 'text-text-muted hover:text-text-main dark:hover:text-white'
              }`}
            >
              <Package size={14} className="text-primary" />
              {t('catalog.itemsTab')}
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('categories')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeViewTab === 'categories'
                  ? 'bg-white dark:bg-surface-2 text-text-main shadow-xs'
                  : 'text-text-muted hover:text-text-main dark:hover:text-white'
              }`}
            >
              <FolderPlus size={14} className="text-indigo-600 dark:text-indigo-400" />
              {t('catalog.categoriesTab')}
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-text-main font-mono">
                {categories.length}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-text-main text-[14px] font-semibold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <UploadCloud size={15} className="text-indigo-600" />
            {t('catalog.importFromExcel')}
          </button>

          <button
            onClick={() => handleExportCsv(false)}
            className="px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-text-main text-[14px] font-semibold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <Download size={15} className="text-text-muted" />
            {t('catalog.exportCsv')}
          </button>

          {canEditCatalog && products.length > 0 && (
            <button
              onClick={handleInitiateDeleteAll}
              className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 text-[14px] font-semibold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
              title={language === 'am' ? 'ሁሉንም እቃዎች አጥፋ' : 'Delete All Catalog Items'}
            >
              <Trash2 size={15} />
              {language === 'am' ? 'ሁሉንም አጥፋ' : 'Delete All'}
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[15px] font-bold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            {t('catalog.addProductQuick')}
          </button>
        </div>
      </div>

      {activeViewTab === 'items' && (
        <>
      {/* 2. Stats Bar & KPI Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('catalog.totalCatalog')}
            </div>
            <div className="text-lg font-black text-text-main font-mono">
              {totalCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-surface-2 text-text-muted flex items-center justify-center">
            <Package size={16} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('catalog.activeProducts')}
            </div>
            <div className="text-lg font-black text-primary font-mono">
              {activeCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-xl bg-primary-soft/60 text-primary flex items-center justify-center">
            <Check size={16} />
          </div>
        </div>

        <div
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
            lowStockFilter
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
              : 'bg-surface border-border-subtle hover:border-rose-300'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              {t('catalog.lowStockAlerts')}
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
          className="p-4 rounded-2xl bg-surface border border-border-subtle shadow-card hover:border-gebeya-300 transition cursor-pointer flex items-center justify-between"
        >
          <div>
            <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
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

      {/* 3. Search and Multi-Filter Bar (Part 4) */}
      <div className="p-4 bg-surface border border-border-subtle rounded-2xl mb-4 flex flex-col gap-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3.5 top-3 text-text-muted" />
            <input
              type="text"
              placeholder={t('catalog.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-input border border-border-subtle text-[15px] text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-gebeya-500 font-medium"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-2.5 text-text-muted hover:text-text-muted cursor-pointer"
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
              className="px-3 py-2 rounded-xl bg-input border border-border-subtle text-[14px] font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-gebeya-500"
            >
              <option value="">{t('catalog.allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
                </option>
              ))}
            </select>

            {/* Quick Filter: Needs Attention (Part 4) */}
            <button
              type="button"
              onClick={() => setNeedsAttentionFilter(!needsAttentionFilter)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                needsAttentionFilter
                  ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                  : 'bg-surface-2 dark:bg-surface border-border-subtle text-text-main hover:border-amber-400'
              }`}
              title={t('catalog.needsAttentionDesc')}
            >
              <AlertCircle size={13} className={needsAttentionFilter ? 'text-white' : 'text-amber-500'} />
              <span>{t('catalog.needsAttention')}</span>
              {needsAttentionCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    needsAttentionFilter
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {needsAttentionCount}
                </span>
              )}
            </button>

            {/* Status Tabs */}
            <div className="inline-flex rounded-xl bg-surface-2 p-1 text-[13px] font-bold border border-border-subtle">
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-surface text-text-main shadow-xs'
                    : 'text-text-muted'
                }`}
              >
                Active
              </button>
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-surface text-text-main shadow-xs'
                    : 'text-text-muted'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('archived')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  statusFilter === 'archived'
                    ? 'bg-surface text-text-main shadow-xs'
                    : 'text-text-muted'
                }`}
              >
                Archived
              </button>
            </div>

            {/* Low Stock Toggle Pill */}
            <button
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                lowStockFilter
                  ? 'bg-rose-500 border-rose-500 text-white'
                  : 'bg-surface-2 dark:bg-surface border-border-subtle text-text-muted'
              }`}
            >
              <AlertTriangle size={13} />
              {t('catalog.lowStock')}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchProducts}
              className="p-2 rounded-xl bg-surface-2 dark:bg-surface border border-border-subtle text-text-muted hover:text-text-main dark:hover:text-white transition cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Typo-tolerant "Did you mean?" Suggestion (Part 4) */}
        {searchSuggestion && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted pt-1 border-t border-border-subtle">
            <span>{language === 'am' ? 'ይህን ፈልገው ነው፡' : 'Did you mean:'}</span>
            <button
              type="button"
              onClick={() => setSearch(searchSuggestion)}
              className="font-bold text-primary hover:underline cursor-pointer"
            >
              {searchSuggestion}
            </button>
          </div>
        )}
      </div>

      {/* 4. Bulk Edit Toolbar (Appears when >= 1 item selected) */}
      {selectedIds.length > 0 && (
        <div className="mb-4 p-3 rounded-2xl bg-surface-2 dark:bg-surface text-white border border-border-subtle dark:border-border-subtle flex flex-wrap items-center justify-between gap-3 shadow-xl animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-full bg-gebeya-500 text-white font-black text-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-bold text-text-main">
              {t('catalog.selectedProducts', { count: selectedIds.length })}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleBulkPrintLabels}
              className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-2 text-xs font-bold flex items-center gap-1.5 transition text-cyan-400"
            >
              <Printer size={14} />
              Print Labels
            </button>

            {/* Change Category Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setIsBulkCategoryOpen(!isBulkCategoryOpen)}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-2 text-xs font-bold flex items-center gap-1.5 transition text-indigo-400"
              >
                <FolderPlus size={14} />
                Change Category
              </button>

              {isBulkCategoryOpen && (
                <div className="absolute right-0 bottom-full mb-2 w-64 bg-surface rounded-2xl shadow-2xl border border-border-subtle p-3 z-50 text-text-main animate-in fade-in">
                  <div className="text-xs font-bold mb-2">Assign Category:</div>
                  <select
                    value={bulkCategoryTarget}
                    onChange={(e) => setBulkCategoryTarget(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs mb-3 font-semibold"
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
                      className="px-2.5 py-1 rounded-lg text-xs font-bold text-text-muted"
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
              className="px-3 py-1.5 rounded-xl bg-surface hover:bg-rose-950 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Archive size={14} />
              {t('catalog.archiveSelected')}
            </button>

            {canEditCatalog && (
              <button
                onClick={handleInitiateBulkDelete}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-rose-950 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Trash2 size={14} />
                {language === 'am' ? `የተመረጡትን አጥፋ (${selectedIds.length})` : `Delete Selected (${selectedIds.length})`}
              </button>
            )}

            <button
              onClick={() => handleExportCsv(true)}
              className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-2 text-xs font-bold flex items-center gap-1.5 transition text-text-muted"
            >
              <Download size={14} />
              {t('catalog.exportCsv')}
            </button>

            <button
              onClick={() => setSelectedIds([])}
              className="w-7 h-7 rounded-full bg-surface hover:bg-surface-2 text-text-muted hover:text-white flex items-center justify-center transition"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* 5. Product Table */}
      <div className="flex-1 bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-card flex flex-col">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            {/* Table Header */}
            <thead className="bg-surface-2 text-text-muted uppercase tracking-wider font-bold text-[14px] sticky top-0 z-10 border-b border-border-subtle">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <button
                    onClick={handleToggleSelectAll}
                    className="text-text-muted hover:text-text-muted dark:hover:text-text-main transition"
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
            <tbody className="divide-y divide-border-subtle font-medium">
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-text-muted">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-gebeya-600" />
                    {t('catalog.loadingCatalog') || 'Loading product catalog...'}
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-12 text-center text-text-muted">
                    <Package size={36} className="mx-auto mb-2 text-text-muted dark:text-text-main" />
                    {t('catalog.noProductsFoundDesc')}
                  </td>
                </tr>
              ) : (
                displayProducts.map((p) => {
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
                      onClick={() => handleOpenEdit(p)}
                      className={`hover:bg-surface-2 dark:hover:bg-surface/40 transition group cursor-pointer ${
                        isSelected ? 'bg-gebeya-50/40 dark:bg-gebeya-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleSelectRow(p.id)}
                          className="text-text-muted hover:text-text-muted transition cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-gebeya-600" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>

                      {/* Product Name, Image & SKU with Inline Edit (Part 4) */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          {/* Image thumbnail / Colored initial */}
                          {(() => {
                            const initColor = getInitialColor(p.name_en || 'Product');
                            const photoSrc = p.photo_path || p.image_url;
                            return (
                              <div
                                className={`w-10 h-10 rounded-xl ${
                                  photoSrc ? 'bg-surface-2' : initColor.bg
                                } border border-border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-xs`}
                              >
                                {photoSrc ? (
                                  <img
                                    src={photoSrc}
                                    alt={p.name_en}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span className={`font-black text-xs ${initColor.text}`}>
                                    {p.name_en.slice(0, 2).toUpperCase()}
                                  </span>
                                )}
                              </div>
                            );
                          })()}

                          <div>
                            {editingCell?.productId === p.id && editingCell?.field === 'name_en' ? (
                              <div onClick={(e) => e.stopPropagation()}>
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell({ ...editingCell, value: e.target.value })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveInline(p.id, 'name_en', editingCell.value);
                                    } else if (e.key === 'Escape') {
                                      setEditingCell(null);
                                    }
                                  }}
                                  onBlur={() => handleSaveInline(p.id, 'name_en', editingCell.value)}
                                  className="px-2 py-1 text-xs font-bold rounded-lg border border-primary bg-surface text-text-main shadow-xs focus:outline-none ring-2 ring-emerald-500/20"
                                />
                                <div className="text-[10px] text-text-muted mt-0.5">
                                  {t('catalog.pressEnterToSave')}
                                </div>
                              </div>
                            ) : (
                              <div
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (canEditCatalog) {
                                    setEditingCell({
                                      productId: p.id,
                                      field: 'name_en',
                                      value: p.name_en,
                                    });
                                  }
                                }}
                                title={canEditCatalog ? t('catalog.editInlineTooltip') : undefined}
                                className={`font-bold text-[16px] text-text-main flex items-center gap-2 rounded px-1 transition ${
                                  flashCell?.productId === p.id && flashCell?.field === 'name_en'
                                    ? 'bg-primary-soft/60 ring-2 ring-emerald-500'
                                    : ''
                                }`}
                              >
                                <span>{p.name_en}</span>
                                {p.is_weighed && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                                    PLU: {p.scale_plu || 'SCALE'}
                                  </span>
                                )}
                              </div>
                            )}
                            {p.name_am && (
                              <div className="text-[13px] text-text-muted font-sans px-1">
                                {p.name_am}
                              </div>
                            )}
                            <div className="text-[12px] font-mono text-text-dim px-1">
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-2 font-mono text-[10px] text-text-main border border-border-subtle"
                              >
                                {bc}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-amber-500 font-bold text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200">
                            No barcode
                          </span>
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-3.5">
                        <span className="px-2.5 py-1 rounded-full bg-surface-2 text-text-main text-[11px] font-semibold border border-border-subtle">
                          {p.category_name || 'General'}
                        </span>
                      </td>

                      {/* UOM */}
                      <td className="p-3.5">
                        <span className="font-mono text-xs font-bold text-text-main">
                          {p.uom_code}
                        </span>
                      </td>

                      {/* Selling Price with Inline Edit (Part 4) */}
                      <td
                        className={`p-3.5 text-right transition rounded ${
                          flashCell?.productId === p.id && flashCell?.field === 'base_price'
                            ? 'bg-primary-soft/60 ring-2 ring-emerald-500'
                            : ''
                        }`}
                        onClick={(e) => {
                          if (editingCell?.productId === p.id && editingCell?.field === 'base_price') {
                            e.stopPropagation();
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (canEditPrice) {
                            setEditingCell({
                              productId: p.id,
                              field: 'base_price',
                              value: String(basePrice),
                            });
                          }
                        }}
                        title={canEditPrice ? t('catalog.editInlineTooltip') : t('catalog.noEditPermission')}
                      >
                        {editingCell?.productId === p.id && editingCell?.field === 'base_price' ? (
                          <div className="flex flex-col items-end" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveInline(p.id, 'base_price', editingCell.value);
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              onBlur={() => handleSaveInline(p.id, 'base_price', editingCell.value)}
                              className="w-24 px-2 py-1 text-xs font-mono font-black text-right rounded-lg border border-primary bg-surface text-text-main shadow-xs focus:outline-none ring-2 ring-emerald-500/20"
                            />
                            <div className="text-[9px] text-text-muted mt-0.5">
                              {t('catalog.pressEnterToSave')}
                            </div>
                          </div>
                        ) : hasOverride ? (
                          <div>
                            <div className="font-mono text-xs font-black text-cyan-600 dark:text-cyan-400">
                              {overridePrice?.toFixed(2)} ETB
                            </div>
                            <div className="text-[10px] text-text-muted font-mono line-through">
                              HQ: {basePrice.toFixed(2)} ETB
                            </div>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300">
                              Branch Override
                            </span>
                          </div>
                        ) : (
                          <div className="font-mono text-[16px] font-bold text-primary flex items-center justify-end gap-1 tabular-nums">
                            <span>{basePrice.toFixed(2)} ETB</span>
                            {!canEditPrice && <Lock size={10} className="text-text-muted" />}
                          </div>
                        )}
                      </td>

                      {/* VAT Type */}
                      <td className="p-3.5 text-center">
                        {p.is_vat_applicable ? (
                          <span className="px-2 py-0.5 rounded-full bg-primary-soft text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            Type A 15%
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-surface-2 text-text-main text-[10px] font-bold">
                            Type B Exempt
                          </span>
                        )}
                      </td>

                      {/* Stock on Hand with Double-Click Min Stock Edit (Part 4) */}
                      <td
                        className={`p-3.5 text-right transition rounded ${
                          flashCell?.productId === p.id && flashCell?.field === 'min_stock_level'
                            ? 'bg-primary-soft/60 ring-2 ring-emerald-500'
                            : ''
                        }`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (canEditCatalog) {
                            setEditingCell({
                              productId: p.id,
                              field: 'min_stock_level',
                              value: String(minStock),
                            });
                          }
                        }}
                        title={canEditCatalog ? t('catalog.editInlineTooltip') : undefined}
                      >
                        <div className="font-mono text-[16px] font-bold text-text-main tabular-nums">
                          {stock.toFixed(2)}
                        </div>
                        {editingCell?.productId === p.id && editingCell?.field === 'min_stock_level' ? (
                          <div className="flex flex-col items-end mt-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              value={editingCell.value}
                              onChange={(e) =>
                                setEditingCell({ ...editingCell, value: e.target.value })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveInline(p.id, 'min_stock_level', editingCell.value);
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              onBlur={() => handleSaveInline(p.id, 'min_stock_level', editingCell.value)}
                              className="w-16 px-1.5 py-0.5 text-[11px] font-mono text-right rounded border border-primary bg-surface"
                            />
                          </div>
                        ) : (
                          <div className="text-[10px] text-text-muted font-mono">
                            Min: {minStock}
                          </div>
                        )}
                        {isLowStock && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-600 block mt-0.5">
                            Low Stock (≤{minStock})
                          </span>
                        )}
                      </td>

                      {/* Active Toggle Switch */}
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={!canEditCatalog}
                          onClick={() => handleToggleActive(p)}
                          className={`w-11 h-6 inline-flex items-center rounded-full p-1 transition cursor-pointer ${
                            p.is_active ? 'bg-emerald-500 justify-end' : 'bg-surface-2 dark:bg-surface-2 justify-start'
                          } ${!canEditCatalog ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={p.is_active ? 'Active (click to deactivate)' : 'Archived (click to activate)'}
                          aria-label={p.is_active ? 'Deactivate product' : 'Activate product'}
                        >
                          <span className="w-4 h-4 rounded-full bg-white shadow-xs block" />
                        </button>
                      </td>

                      {/* Row Action Buttons & Dropdown Menu (Part 4) */}
                      <td className="p-3.5 text-right relative" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                          {/* Edit (Opens Drawer) */}
                          <button
                            title={t('catalog.editProduct')}
                            onClick={() => handleOpenEdit(p)}
                            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-gebeya-100 dark:hover:bg-gebeya-950 text-text-muted hover:text-gebeya-600 flex items-center justify-center transition cursor-pointer"
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Adjust Stock / Damaged / Expired / Count Correction */}
                          <button
                            title={language === 'am' ? 'ክምችት አስተካክል (የተበላሸ፣ የጠፋ፣ ቆጠራ...)' : 'Adjust Stock (Damaged, Expired, Theft, Count)'}
                            onClick={() => {
                              setAdjustTarget(p);
                              setIsAdjustModalOpen(true);
                            }}
                            className="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center transition cursor-pointer"
                          >
                            <SlidersHorizontal size={13} />
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
                            className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-cyan-100 dark:hover:bg-cyan-950 text-text-muted hover:text-cyan-600 flex items-center justify-center transition cursor-pointer"
                          >
                            <Printer size={13} />
                          </button>

                          {/* Three-dot More Actions Menu (Part 4) */}
                          <div className="relative">
                            <button
                              title={t('catalog.actions')}
                              onClick={() => setOpenActionMenuId(openActionMenuId === p.id ? null : p.id)}
                              className="w-7 h-7 rounded-lg bg-surface-2 hover:bg-surface-2 dark:hover:bg-surface-2 text-text-muted flex items-center justify-center transition cursor-pointer"
                            >
                              <MoreVertical size={13} />
                            </button>

                            {openActionMenuId === p.id && (
                              <div
                                className="absolute right-0 top-full mt-1 w-44 bg-surface rounded-2xl shadow-xl border border-border-subtle p-1.5 z-50 text-text-main text-left animate-in fade-in"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    handleOpenEdit(p);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold flex items-center gap-2 text-text-main cursor-pointer"
                                >
                                  <Edit2 size={13} />
                                  <span>{t('catalog.editProduct')}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setAdjustTarget(p);
                                    setIsAdjustModalOpen(true);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400 cursor-pointer"
                                >
                                  <SlidersHorizontal size={13} />
                                  <span>{language === 'am' ? 'ክምችት አስተካክል' : 'Adjust Stock'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    handleDuplicate(p);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400 cursor-pointer"
                                >
                                  <Copy size={13} />
                                  <span>{t('catalog.duplicateAction')}</span>
                                </button>

                                {canEditPrice && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      setHistoryProduct(p);
                                      setIsHistoryModalOpen(true);
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-xl hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold flex items-center gap-2 text-primary cursor-pointer"
                                  >
                                    <DollarSign size={13} />
                                    <span>{t('catalog.changePriceAction')}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setHistoryProduct(p);
                                    setIsHistoryModalOpen(true);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-xl hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400 cursor-pointer"
                                >
                                  <History size={13} />
                                  <span>{t('catalog.viewHistoryAction')}</span>
                                </button>

                                <div className="h-px bg-surface-2 my-1" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    handleInitiateArchive(p);
                                  }}
                                  className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
                                    p.is_active
                                      ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                                      : 'text-primary hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                  }`}
                                >
                                  <Archive size={13} />
                                  <span>{p.is_active ? t('catalog.archiveCategoryAction') : t('catalog.unarchiveSelected')}</span>
                                </button>

                                {canEditCatalog && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionMenuId(null);
                                      handleInitiateDeleteSingle(p);
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  >
                                    <Trash2 size={13} />
                                    <span>{language === 'am' ? 'እቃውን ሰርዝ' : 'Delete Product'}</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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
        <div className="p-4 border-t border-border-subtle bg-surface-2 flex items-center justify-between text-[14px] text-text-muted font-medium">
          <span>
            Showing {products.length} of {totalCount} items
          </span>
          <span className="text-[11px]">
            {brand.displayName} Master Catalog • Synced with Sync Outbox
          </span>
        </div>
      </div>
      </>
      )}

      {/* View 2: Categories Section on the same page */}
      {activeViewTab === 'categories' && (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Alerts */}
          {catError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0" />
              <span>{catError}</span>
            </div>
          )}
          {catSuccess && (
            <div className="p-3.5 rounded-2xl bg-primary-soft border border-emerald-200 dark:border-emerald-800 text-primary text-xs flex items-center gap-2 animate-in fade-in">
              <Check size={16} className="shrink-0" />
              <span>{catSuccess}</span>
            </div>
          )}

          {/* Top: Add New Category Form */}
          <form
            onSubmit={handleCreateCategory}
            className="p-5 rounded-2xl bg-surface border border-border-subtle space-y-4 shadow-card"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-main flex items-center gap-1.5">
                <FolderPlus size={15} className="text-indigo-600" />
                {t('catalog.addNewCategory')}
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('catalog.categoryNameEn')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dairy & Eggs"
                  value={newCatNameEn}
                  onChange={(e) => setNewCatNameEn(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('catalog.categoryNameAm')}
                </label>
                <input
                  type="text"
                  placeholder="ለምሳሌ የወተት ተዋጽኦ"
                  value={newCatNameAm}
                  onChange={(e) => setNewCatNameAm(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-text-muted block mb-1">
                    {t('catalog.categoryCode')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DAIRY"
                    value={newCatCode}
                    onChange={(e) => setNewCatCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={catSaving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs shrink-0 disabled:opacity-50"
                >
                  {catSaving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={14} />}
                  {t('catalog.addNewCategory')}
                </button>
              </div>
            </div>
          </form>

          {/* Categories Table */}
          <div className="flex-1 bg-surface border border-border-subtle rounded-2xl overflow-hidden flex flex-col shadow-card">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-2 text-[11px] font-extrabold text-text-muted uppercase tracking-wider sticky top-0 z-10">
                    <th className="p-3.5 pl-5">Code</th>
                    <th className="p-3.5">Category Name (EN / AM)</th>
                    <th className="p-3.5 text-center">{t('catalog.itemCount')}</th>
                    <th className="p-3.5 text-right pr-5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle font-medium">
                  {categories.map((c) => {
                    const count = Number(c.product_count || 0);
                    return (
                      <tr key={c.id} className="hover:bg-surface-2 dark:hover:bg-surface/40 transition">
                        <td className="p-3.5 pl-5 font-mono font-bold text-text-muted">
                          {c.code}
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-text-main">{c.name_en}</div>
                          {c.name_am && (
                            <div className="text-[11px] text-text-muted">{c.name_am}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                            count > 0
                              ? 'bg-primary-soft text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface-2 text-text-muted'
                          }`}>
                            {count}
                          </span>
                        </td>
                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingCategory(c);
                                setRenameNameEn(c.name_en);
                                setRenameNameAm(c.name_am || '');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-2 text-text-main text-xs font-bold flex items-center gap-1 transition"
                            >
                              <Edit2 size={12} />
                              {t('catalog.renameCategory')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleArchiveCategory(c)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <Archive size={12} />
                              {t('catalog.archiveCategoryAction')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Rename Category Modal */}
      {renamingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-extrabold text-text-main">
              {t('catalog.renameCategory')} ({renamingCategory.code})
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('catalog.categoryNameEn')}
                </label>
                <input
                  type="text"
                  value={renameNameEn}
                  onChange={(e) => setRenameNameEn(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  {t('catalog.categoryNameAm')}
                </label>
                <input
                  type="text"
                  value={renameNameAm}
                  onChange={(e) => setRenameNameAm(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs text-text-main"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenamingCategory(null)}
                className="px-4 py-2 rounded-xl bg-surface-2 text-xs font-bold text-text-main"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={renameSaving}
                onClick={handleSaveRename}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {renameSaving && <RefreshCw size={13} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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
        onDeleted={() => {
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
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-md p-6 space-y-4">
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
                <h3 className="text-base font-extrabold text-text-main">
                  {archiveTarget.is_active ? 'Archive Product' : 'Restore Product'}
                </h3>
                <p className="text-xs text-text-muted">{archiveTarget.name_en}</p>
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
              <p className="text-xs text-text-muted">
                {archiveTarget.is_active
                  ? 'Archiving will deactivate this product and hide it from the active POS register. You can restore it anytime.'
                  : 'Restoring this product will activate it and make it immediately searchable on POS cashier terminals.'}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsArchiveModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface-2 dark:bg-surface hover:bg-surface-2 dark:hover:bg-surface-2 text-xs font-bold text-text-main transition"
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

      {/* 8-Second Undo Toast (Part 4) */}
      {undoToast && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-2xl bg-surface-2 text-white shadow-2xl flex items-center gap-3 border border-border-subtle animate-in slide-in-from-bottom-3 duration-200">
          <Check size={16} className="text-emerald-400 shrink-0" />
          <div className="text-xs">
            <span className="font-bold">{undoToast.productName}:</span> {t('catalog.savedInline')}
          </div>
          <button
            onClick={handleUndo}
            className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
          >
            <RotateCcw size={12} />
            {t('catalog.undoAction')}
          </button>
          <button
            onClick={() => setUndoToast(null)}
            className="text-text-muted hover:text-white p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 1. Single Item Delete Confirmation Modal */}
      {isDeleteModalOpen && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center font-bold">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-text-main">
                  {language === 'am' ? 'እቃውን መሰረዝ ይፈልጋሉ?' : 'Delete Product?'}
                </h3>
                <p className="text-xs text-text-muted">{deleteTarget.name_en} ({deleteTarget.sku})</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs space-y-2">
              <p>
                {language === 'am'
                  ? 'እቃው ቀደም ሲል የተመዘገበ የሽያጭ ደረሰኝ ከሌለው ሙሉ በሙሉ ከሲስተሙ ይጠፋል። ሽያጭ ካለው ግን የፋይናንስ ኦዲትን ለመጠበቅ በራስ-ሰር ይደበቃል (Archive ይሆናል)።'
                  : 'If this product has never been sold, it will be permanently deleted along with its barcodes and ledger entries. If it has recorded sales, it will be safely deactivated/archived to protect fiscal audit history.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 rounded-xl bg-surface-2 dark:bg-surface hover:bg-surface-2 text-xs font-bold text-text-main transition cursor-pointer"
              >
                {language === 'am' ? 'ይቅር' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={handleConfirmDeleteSingle}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {actionInProgress && <RefreshCw size={13} className="animate-spin" />}
                {language === 'am' ? 'አጥፋ' : 'Delete Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-border-subtle w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center font-bold">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-text-main">
                  {language === 'am' ? 'የተመረጡትን እቃዎች ሰርዝ' : 'Delete Selected Products'}
                </h3>
                <p className="text-xs text-text-muted">
                  {language === 'am' ? `${selectedIds.length} እቃዎች ተመርጠዋል` : `${selectedIds.length} items selected`}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs space-y-2">
              <p>
                {language === 'am'
                  ? `እርግጠኛ ነዎት ${selectedIds.length} የተመረጡትን እቃዎች መሰረዝ ይፈልጋሉ? ሽያጭ የሌላቸው እቃዎች ሙሉ በሙሉ ሲጠፉ፤ ሽያጭ ያላቸው ግን በራስ-ሰር ይደበቃሉ (Archive ይሆናሉ)።`
                  : `Are you sure you want to delete ${selectedIds.length} selected items? Items without sales will be permanently deleted; items with recorded sales will be safely deactivated/archived.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-surface-2 dark:bg-surface hover:bg-surface-2 text-xs font-bold text-text-main transition cursor-pointer"
              >
                {language === 'am' ? 'ይቅር' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={actionInProgress}
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {actionInProgress && <RefreshCw size={13} className="animate-spin" />}
                {language === 'am' ? `ሰርዝ (${selectedIds.length})` : `Delete Selected (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Delete All / Clear Catalog Confirmation Modal */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-3xl shadow-2xl border border-rose-300 dark:border-rose-900 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-bold shadow-lg">
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-600 dark:text-rose-400">
                  {language === 'am' ? 'ማስጠንቀቂያ፡ ሙሉ ካታሎጉን ማጥፋት' : 'Danger: Clear Entire Catalog'}
                </h3>
                <p className="text-xs text-text-muted">
                  {language === 'am' ? `በአጠቃላይ ${products.length} እቃዎች ይነካሉ` : `Affects all ${products.length} items`}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs space-y-2">
              <p className="font-bold">
                {language === 'am'
                  ? 'ይህ ተግባር በካታሎጉ ውስጥ ያሉትን ሁሉንም እቃዎች ያጠፋል!'
                  : 'This action will clear all products from the catalog!'}
              </p>
              <p>
                {language === 'am'
                  ? 'ሽያጭ የሌላቸው እቃዎች፣ ባርኮዶች እና የስቶክ መረጃዎች በቋሚነት ይሰረዛሉ። ሽያጭ የተመዘገበባቸው እቃዎች ግን የፋይናንስ ህጉን ለመጠበቅ በራስ-ሰር ተደብቀው (Archive ሆነው) ይቀራሉ።'
                  : 'Products with no recorded sales will be permanently purged. Any products that were ever sold will be deactivated and hidden to protect tax and audit records.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-text-main block">
                  {language === 'am'
                    ? 'እባክዎ ለማረጋገጥ "DELETE ALL" ብለው በትክክል ይጻፉ፡'
                    : 'Type "DELETE ALL" to confirm:'}
                </label>
                <button
                  type="button"
                  onClick={() => setDeleteAllConfirmInput('DELETE ALL')}
                  className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  {language === 'am' ? '👉 እዚህ ይጫኑ (DELETE ALL)' : '👉 Auto-fill "DELETE ALL"'}
                </button>
              </div>
              <input
                type="text"
                autoFocus
                value={deleteAllConfirmInput}
                onChange={(e) => setDeleteAllConfirmInput(e.target.value)}
                placeholder="DELETE ALL"
                className="w-full px-3.5 py-2.5 rounded-xl bg-input border-2 border-rose-300 dark:border-rose-700 font-mono font-bold text-sm text-text-main focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionInProgress}
                onClick={() => {
                  setIsDeleteAllModalOpen(false);
                  setDeleteAllConfirmInput('');
                }}
                className="px-4 py-2 rounded-xl bg-surface-2 dark:bg-surface hover:bg-surface-2 text-xs font-bold text-text-main transition cursor-pointer"
              >
                {language === 'am' ? 'ይቅር' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={
                  actionInProgress ||
                  !['DELETE ALL', 'ሰርዝ', 'አጥፋ'].includes(deleteAllConfirmInput.trim().toUpperCase())
                }
                onClick={handleConfirmDeleteAll}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black transition flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                {actionInProgress && <RefreshCw size={13} className="animate-spin" />}
                {language === 'am' ? 'ሙሉ ካታሎጉን አጥፋ' : 'Delete All Catalog Items'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Stock Adjustment Modal (Damaged, Expired, Theft, Correction, Internal Use) */}
      <StockAdjustmentModal
        isOpen={isAdjustModalOpen}
        product={adjustTarget}
        onClose={() => {
          setIsAdjustModalOpen(false);
          setAdjustTarget(null);
        }}
        onSuccess={(msg) => {
          setDeleteNotice({ type: 'success', message: msg });
          fetchProducts();
        }}
      />

      {/* Action Result Notice Toast */}
      {deleteNotice && (
        <div className="fixed bottom-6 left-6 z-50 p-4 rounded-2xl bg-surface-2 text-white shadow-2xl flex items-center gap-3 border border-border-subtle animate-in slide-in-from-bottom-3 duration-200 max-w-md">
          {deleteNotice.type === 'success' ? (
            <Check size={18} className="text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          )}
          <div className="text-xs font-medium flex-1">
            {deleteNotice.message}
          </div>
          <button
            onClick={() => setDeleteNotice(null)}
            className="text-text-muted hover:text-white p-1 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
