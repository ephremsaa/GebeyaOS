import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  AlertTriangle,
  Calendar,
  Layers,
  Search,
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
  X,
  ShieldAlert,
  Tag,
  FileSpreadsheet,
  Printer,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';
import { useBrand } from '../brand/BrandContext';
import { posApi } from '../utils/pos-api';
import {
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
import { StockAdjustmentModal } from './inventory/StockAdjustmentModal';

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

export interface ExpiryListBatch {
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  productNameAm?: string;
  sku: string;
  uomCode: string;
  basePrice: number;
  clearancePrice?: number | null;
  photoPath?: string | null;
  categoryId?: string;
  categoryName?: string;
  supplierId?: string;
  supplierName?: string;
  currentQuantity: number;
  unitCost: number;
  totalCost: number;
  expiryDate: string;
  receivedDate: string;
  daysLeft: number;
  stage: 'EXPIRED' | '7D' | '30D' | '90D' | 'OK';
  humanTextEn: string;
  humanTextAm: string;
}

export interface ExpirySummary {
  expiredCount: number;
  expiredCostValue: number;
  within7dCount: number;
  within7dCostValue: number;
  within30dCount: number;
  within30dCostValue: number;
  within90dCount: number;
  within90dCostValue: number;
  valueAtRisk: number;
  totalBatches: number;
}

export const StockAndExpiryView: React.FC = () => {
  const { language, t, formatCurrency } = useI18n();
  const { hasPermission, currentUser, fetchWithAuth } = useAuth();
  const brand = useBrand();

  const [products, setProducts] = useState<StockItem[]>([]);
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name_en: string; name_am?: string }>>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // View Mode: By Item (Stock) vs By Batch (Expiry) vs Full Expiry List
  const [viewMode, setViewMode] = useState<'item' | 'batch' | 'expiry_list'>('item');

  // Filter Tabs (for Item and Batch views): All | Expiring soon | Low stock | Expired
  const [filterTab, setFilterTab] = useState<'all' | 'expiring_soon' | 'low_stock' | 'expired'>('all');
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  // Expiry List Tab state
  const [expiryBatches, setExpiryBatches] = useState<ExpiryListBatch[]>([]);
  const [expirySummary, setExpirySummary] = useState<ExpirySummary>({
    expiredCount: 0,
    expiredCostValue: 0,
    within7dCount: 0,
    within7dCostValue: 0,
    within30dCount: 0,
    within30dCostValue: 0,
    within90dCount: 0,
    within90dCostValue: 0,
    valueAtRisk: 0,
    totalBatches: 0,
  });
  const [expiryChip, setExpiryChip] = useState<'all' | 'expired' | '7d' | '30d' | '90d' | 'ok'>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [expiryStartDate, setExpiryStartDate] = useState<string>('');
  const [expiryEndDate, setExpiryEndDate] = useState<string>('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // Clearance Markdown Modal State
  const [clearanceModalBatch, setClearanceModalBatch] = useState<ExpiryListBatch | null>(null);
  const [clearancePriceInput, setClearancePriceInput] = useState<string>('');
  const [clearanceStartInput, setClearanceStartInput] = useState<string>('');
  const [clearanceEndInput, setClearanceEndInput] = useState<string>('');
  const [clearanceReasonInput, setClearanceReasonInput] = useState<string>('');
  const [clearanceSubmitting, setClearanceSubmitting] = useState<boolean>(false);
  const [clearanceError, setClearanceError] = useState<string | null>(null);

  // Bulk Write Off Modal State
  const [isBulkWriteOffOpen, setIsBulkWriteOffOpen] = useState<boolean>(false);
  const [bulkWriteOffReason, setBulkWriteOffReason] = useState<string>('Expired inventory disposal');
  const [bulkWriteOffSubmitting, setBulkWriteOffSubmitting] = useState<boolean>(false);
  const [bulkWriteOffError, setBulkWriteOffError] = useState<string | null>(null);

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

  // Single Item Stock Count Modal (Inline Stocktake)
  const [countTarget, setCountTarget] = useState<StockItem | null>(null);
  const [countedQty, setCountedQty] = useState<string>('');
  const [countReason, setCountReason] = useState<string>('Physical stock verification');
  const [countSubmitting, setCountSubmitting] = useState<boolean>(false);
  const [countError, setCountError] = useState<string | null>(null);

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

  // Calendar preference for Ethiopian dates
  const calendarPref =
    typeof window !== 'undefined'
      ? localStorage.getItem('gebeya_calendar_preference') || 'gregorian'
      : 'gregorian';

  const formatBatchDate = (d?: string | null) => {
    if (!d) return '—';
    if (calendarPref === 'ethiopic') {
      return formatEthiopianDisplayDate(d.slice(0, 10), language);
    }
    return d.slice(0, 10);
  };

  // Fetch Suppliers
  useEffect(() => {
    posApi.getSuppliers().then((sups) => {
      if (Array.isArray(sups)) {
        setSuppliers(sups.map((s: any) => ({ id: s.id, name: s.name })));
      }
    });
  }, []);

  // Fetch Expiry List Batches and Summaries
  const fetchExpiryData = async () => {
    try {
      const res = await posApi.getExpiryList({
        warningDays: 90,
        search: search.trim() || undefined,
        categoryId: selectedCategory || undefined,
        supplierId: selectedSupplier || undefined,
        status: expiryChip !== 'all' ? expiryChip : undefined,
        startDate: expiryStartDate || undefined,
        endDate: expiryEndDate || undefined,
        branchId: currentUser?.branchId,
      });
      if (res?.batches) {
        setExpiryBatches(res.batches);
      }
      if (res?.summary) {
        setExpirySummary(res.summary);
      }
    } catch (err) {
      console.warn('Failed to load expiry list data', err);
    }
  };

  // Fetch Inventory and Batches
  const fetchData = async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, expiringRes] = await Promise.all([
        posApi.getCatalogProducts({
          search: search.trim() || undefined,
          category_id: selectedCategory || undefined,
          limit: 5000,
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
      if (viewMode === 'expiry_list') {
        fetchExpiryData();
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

  useEffect(() => {
    if (viewMode === 'expiry_list') {
      const timer = setTimeout(fetchExpiryData, 150);
      return () => clearTimeout(timer);
    }
  }, [viewMode, search, selectedCategory, selectedSupplier, expiryChip, expiryStartDate, expiryEndDate, currentUser]);

  // Clearance Handlers
  const handleOpenClearance = (b: ExpiryListBatch) => {
    setClearanceModalBatch(b);
    setClearancePriceInput(b.clearancePrice ? String(b.clearancePrice) : String((b.basePrice * 0.8).toFixed(2)));
    setClearanceStartInput(new Date().toISOString().slice(0, 10));
    setClearanceEndInput(b.expiryDate ? b.expiryDate.slice(0, 10) : '');
    setClearanceReasonInput(b.clearancePrice ? 'Updated clearance promotion' : 'Clearance sale for expiring batch');
    setClearanceError(null);
  };

  const handleSubmitClearance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clearanceModalBatch) return;
    const price = parseFloat(clearancePriceInput);
    if (isNaN(price) || price <= 0) {
      setClearanceError('Please enter a valid positive price');
      return;
    }
    setClearanceSubmitting(true);
    setClearanceError(null);
    try {
      await posApi.setBatchClearancePrice(
        clearanceModalBatch.batchId,
        {
          clearancePrice: price,
          startDate: clearanceStartInput || undefined,
          endDate: clearanceEndInput || undefined,
          reason: clearanceReasonInput.trim() || undefined,
        },
        currentUser?.branchId,
        currentUser?.id,
      );
      setSuccessMsg(
        t('inventory.clearanceSuccess', {
          price: price.toFixed(2),
          batch: clearanceModalBatch.batchNumber,
        }),
      );
      setClearanceModalBatch(null);
      fetchExpiryData();
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setClearanceError(err.message || 'Failed to set clearance price');
    } finally {
      setClearanceSubmitting(false);
    }
  };

  // Bulk Selection Handlers
  const handleToggleSelectBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId],
    );
  };

  const handleSelectAllVisible = () => {
    if (selectedBatchIds.length === expiryBatches.length) {
      setSelectedBatchIds([]);
    } else {
      setSelectedBatchIds(expiryBatches.map((b) => b.batchId));
    }
  };

  const handleSelectAllExpired = () => {
    const expiredIds = expiryBatches.filter((b) => b.stage === 'EXPIRED').map((b) => b.batchId);
    setSelectedBatchIds(expiredIds);
  };

  // Bulk Write Off Handlers
  const selectedBatchesInfo = useMemo(() => {
    const selected = expiryBatches.filter((b) => selectedBatchIds.includes(b.batchId));
    const totalCost = selected.reduce((sum, b) => sum + b.totalCost, 0);
    const totalUnits = selected.reduce((sum, b) => sum + b.currentQuantity, 0);
    return { selected, totalCost, totalUnits };
  }, [expiryBatches, selectedBatchIds]);

  const handleOpenBulkWriteOff = () => {
    if (selectedBatchIds.length === 0) return;
    setBulkWriteOffReason('Expired stock disposal');
    setBulkWriteOffError(null);
    setIsBulkWriteOffOpen(true);
  };

  const handleSubmitBulkWriteOff = async () => {
    if (selectedBatchIds.length === 0) return;
    if (!bulkWriteOffReason.trim()) {
      setBulkWriteOffError(t('inventory.reasonRequired'));
      return;
    }
    setBulkWriteOffSubmitting(true);
    setBulkWriteOffError(null);
    try {
      const res = await posApi.bulkWriteOffExpiredBatches(
        selectedBatchIds,
        bulkWriteOffReason.trim(),
        currentUser?.branchId,
        currentUser?.id,
      );
      setSuccessMsg(
        t('inventory.bulkWriteOffSuccess', {
          count: res.batchesCount || selectedBatchIds.length,
          cost: (res.totalCostValue || selectedBatchesInfo.totalCost).toFixed(2),
        }),
      );
      setSelectedBatchIds([]);
      setIsBulkWriteOffOpen(false);
      fetchExpiryData();
      fetchData();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setBulkWriteOffError(err.message || 'Failed to bulk write off batches');
    } finally {
      setBulkWriteOffSubmitting(false);
    }
  };

  // Export to Excel / CSV
  const handleExportExpiryExcel = () => {
    if (expiryBatches.length === 0) return;
    const headers = [
      'Product (EN)',
      'Product (AM)',
      'SKU',
      'Category',
      'Supplier',
      'Batch Number',
      'Quantity on Hand',
      'UOM',
      'Unit Cost (ETB)',
      'Total Cost (ETB)',
      'Received Date',
      'Expiry Date',
      'Days Left',
      'Status',
      'Clearance Price (ETB)',
    ];

    const rows = expiryBatches.map((b) => [
      `"${(b.productName || '').replace(/"/g, '""')}"`,
      `"${(b.productNameAm || '').replace(/"/g, '""')}"`,
      `"${b.sku || ''}"`,
      `"${(b.categoryName || 'General').replace(/"/g, '""')}"`,
      `"${(b.supplierName || '—').replace(/"/g, '""')}"`,
      `"${b.batchNumber}"`,
      b.currentQuantity,
      b.uomCode,
      b.unitCost.toFixed(2),
      b.totalCost.toFixed(2),
      b.receivedDate,
      b.expiryDate,
      `"${language === 'am' ? b.humanTextAm : b.humanTextEn}"`,
      b.stage,
      b.clearancePrice ? b.clearancePrice.toFixed(2) : '—',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const brandSlug = (brand.displayName || 'Stock').replace(/[^a-zA-Z0-9]+/g, '_');
    link.setAttribute('download', `${brandSlug}_Expiry_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF / Printable Layout
  const handleExportExpiryPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const dateStr = new Date().toLocaleDateString();
    const rowsHtml = expiryBatches
      .map(
        (b) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 12px;">
          <td style="padding: 8px;"><strong>${b.productName}</strong><br/><span style="color:#64748b;">${b.productNameAm || ''}</span></td>
          <td style="padding: 8px; font-family: monospace;">${b.batchNumber}</td>
          <td style="padding: 8px; text-align: right; font-weight: bold;">${b.currentQuantity} ${b.uomCode}</td>
          <td style="padding: 8px; text-align: center;">${b.receivedDate}</td>
          <td style="padding: 8px; text-align: center; color: ${b.stage === 'EXPIRED' ? '#dc2626' : '#0f172a'}; font-weight: bold;">${b.expiryDate}</td>
          <td style="padding: 8px; text-align: center;">${language === 'am' ? b.humanTextAm : b.humanTextEn}</td>
          <td style="padding: 8px; text-align: center; font-weight: bold; color: ${b.stage === 'EXPIRED' ? '#dc2626' : b.stage === '7D' ? '#ea580c' : b.stage === '30D' ? '#d97706' : '#16a34a'};">${b.stage}</td>
          <td style="padding: 8px; text-align: right; font-family: monospace;">${b.totalCost.toFixed(2)} ETB</td>
        </tr>`,
      )
      .join('');

    const brandName = currentUser?.tenantName || brand.displayName || 'Supermarket';
    printWindow.document.write(`
      <html>
        <head>
          <title>${brandName} - Expiry Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 4px 0; font-size: 20px; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
            .summary { background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; display: flex; gap: 24px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background: #f1f5f9; padding: 8px; font-size: 11px; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>${brandName} - Stock Expiry Report</h1>
              <p style="margin: 0; font-size: 12px; color: #64748b;">${brandName} • ${currentUser?.branchName || 'Main Branch'}</p>
            </div>
            <div style="text-align: right; font-size: 12px;">
              <p style="margin: 0;"><strong>Date:</strong> ${dateStr}</p>
              <p style="margin: 0; color: #dc2626; font-weight: bold;">Value at Risk: ${expirySummary.valueAtRisk.toFixed(2)} ETB</p>
            </div>
          </div>
          <div class="summary">
            <div><strong>Expired:</strong> ${expirySummary.expiredCount} batches (${expirySummary.expiredCostValue.toFixed(2)} ETB)</div>
            <div><strong>Within 7d:</strong> ${expirySummary.within7dCount} batches (${expirySummary.within7dCostValue.toFixed(2)} ETB)</div>
            <div><strong>Within 30d:</strong> ${expirySummary.within30dCount} batches (${expirySummary.within30dCostValue.toFixed(2)} ETB)</div>
            <div><strong>Within 3 mos:</strong> ${expirySummary.within90dCount} batches (${expirySummary.within90dCostValue.toFixed(2)} ETB)</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch #</th>
                <th style="text-align: right;">Quantity</th>
                <th style="text-align: center;">Received</th>
                <th style="text-align: center;">Expiry</th>
                <th style="text-align: center;">Days Left</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: right;">Cost Value</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Color initial palette
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
    setIsAdjModalOpen(true);
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
        const res = await (fetchWithAuth || fetch)('/api/inventory/adjustments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-branch-id': currentUser?.branchId || '00000000-0000-0000-0000-000000000001',
            'x-user-id': currentUser?.id || '00000000-0000-0000-0000-000000000002',
          },
          body: JSON.stringify({
            reasonCode: 'CORRECTION',
            notes: `${countReason.trim()} (Counted: ${countedVal}, System: ${currentOnHand}, Variance: ${variance > 0 ? '+' : ''}${variance.toFixed(2)})`,
            items: [
              {
                productId: countTarget.id,
                quantityChange: variance,
              },
            ],
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = Array.isArray(errData.message)
            ? errData.message.join(', ')
            : errData.message || 'Failed to submit stock count';
          throw new Error(errMsg);
        }
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
    <div className="flex-1 flex flex-col min-h-0 md:h-full bg-page p-3 sm:p-6 overflow-y-auto md:overflow-hidden select-none text-text-main">
      {/* ─── 1. Header & Actions ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-[26px] font-extrabold text-text-main flex items-center gap-2.5 tracking-tight">
              <Layers className="text-primary" size={24} />
              {t('inventory.stockAndExpiry')}
            </h1>
            <p className="text-[14px] text-text-muted mt-0.5">
              {t('inventory.stockAndExpirySubtitle')}
            </p>
          </div>

          {/* View Mode Toggle: By Item vs By Batch vs Expiry List */}
          <div className="flex items-center gap-1 p-1 bg-surface-2 rounded-xl border border-border-subtle self-start">
            <button
              type="button"
              onClick={() => setViewMode('item')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'item'
                  ? 'bg-primary text-white shadow-soft font-bold'
                  : 'text-text-muted hover:text-text-main font-semibold'
              }`}
            >
              <Package size={14} className="text-primary" />
              {t('inventory.viewByItem')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('batch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'batch'
                  ? 'bg-primary text-white shadow-soft font-bold'
                  : 'text-text-muted hover:text-text-main font-semibold'
              }`}
            >
              <Calendar size={14} className="text-amber-500" />
              {t('inventory.viewByBatch')}
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-text-main font-mono">
                {batches.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('expiry_list');
                fetchExpiryData();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === 'expiry_list'
                  ? 'bg-primary text-white shadow-soft font-bold'
                  : 'text-text-muted hover:text-text-main font-semibold'
              }`}
            >
              <Clock size={14} className="text-rose-500" />
              {t('inventory.tabExpiryList')}
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-2 text-text-main font-mono">
                {expiryBatches.length}
              </span>
            </button>
          </div>
        </div>

        {/* Primary Action Button: Add Stock */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsChooserOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[15px] font-bold flex items-center gap-2 shadow-soft transition active:scale-95 cursor-pointer"
          >
            <Plus size={16} />
            {t('inventory.addStock')}
          </button>
        </div>
      </div>

      {/* Global Toast Success Message */}
      {successMsg && (
        <div className="mb-4 p-3 rounded-2xl bg-primary-soft border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={16} className="text-primary shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Daily Expiration Alert Notification Banner (Standard View) */}
      {viewMode !== 'expiry_list' && (kpis.expired > 0 || kpis.expiring7 > 0) && (
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
            onClick={() => {
              setViewMode('expiry_list');
              setExpiryChip('expired');
              fetchExpiryData();
            }}
            className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shrink-0 shadow-xs"
          >
            {t('inventory.expired')} ({kpis.expired})
          </button>
        </div>
      )}

      {/* ─── 2. Top Summary Cards ─── */}
      {viewMode === 'expiry_list' ? (
        /* EXPIRY LIST SUMMARY CARDS & VALUE AT RISK */
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Card 1: Expired */}
            <div
              onClick={() => setExpiryChip((prev) => (prev === 'expired' ? 'all' : 'expired'))}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                expiryChip === 'expired'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                  : 'bg-surface border-border-subtle shadow-card hover:border-danger'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {t('inventory.expiredSummary')}
                </div>
                <div className="text-xl font-black text-rose-600 font-mono">
                  {expirySummary.expiredCount}
                </div>
                <div className="text-[11px] font-mono text-text-muted font-semibold mt-0.5">
                  {formatCurrency(expirySummary.expiredCostValue)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center shrink-0">
                <AlertOctagon size={20} />
              </div>
            </div>

            {/* Card 2: Within 7 Days */}
            <div
              onClick={() => setExpiryChip((prev) => (prev === '7d' ? 'all' : '7d'))}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                expiryChip === '7d'
                  ? 'bg-orange-50 dark:bg-orange-950/50 border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                  : 'bg-surface border-border-subtle shadow-card hover:border-warning'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {t('inventory.within7Days')}
                </div>
                <div className="text-xl font-black text-orange-600 font-mono">
                  {expirySummary.within7dCount}
                </div>
                <div className="text-[11px] font-mono text-text-muted font-semibold mt-0.5">
                  {formatCurrency(expirySummary.within7dCostValue)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950 text-orange-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
            </div>

            {/* Card 3: Within 30 Days */}
            <div
              onClick={() => setExpiryChip((prev) => (prev === '30d' ? 'all' : '30d'))}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                expiryChip === '30d'
                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                  : 'bg-surface border-border-subtle shadow-card hover:border-warning'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {t('inventory.within30Days')}
                </div>
                <div className="text-xl font-black text-amber-600 font-mono">
                  {expirySummary.within30dCount}
                </div>
                <div className="text-[11px] font-mono text-text-muted font-semibold mt-0.5">
                  {formatCurrency(expirySummary.within30dCostValue)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
            </div>

            {/* Card 4: Within 3 Months */}
            <div
              onClick={() => setExpiryChip((prev) => (prev === '90d' ? 'all' : '90d'))}
              className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                expiryChip === '90d'
                  ? 'bg-yellow-50 dark:bg-yellow-950/50 border-yellow-500 ring-2 ring-yellow-500/20 shadow-xs'
                  : 'bg-surface border-border-subtle shadow-card hover:border-accent'
              }`}
            >
              <div>
                <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                  {t('inventory.within3Months')}
                </div>
                <div className="text-xl font-black text-yellow-600 font-mono">
                  {expirySummary.within90dCount}
                </div>
                <div className="text-[11px] font-mono text-text-muted font-semibold mt-0.5">
                  {formatCurrency(expirySummary.within90dCostValue)}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-950 text-yellow-600 flex items-center justify-center shrink-0">
                <AlertCircle size={20} />
              </div>
            </div>
          </div>

          {/* Value at Risk Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-950/30 dark:to-rose-950/30 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                <ShieldAlert size={18} />
              </div>
              <div>
                <div className="text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  {t('inventory.valueAtRisk')}
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-300">
                  {language === 'am'
                    ? 'በ3 ወራት ውስጥ ሊያልቁ የታቀዱ እቃዎች አጠቃላይ የወጪ ዋጋ'
                    : 'Total acquisition cost of inventory batches expiring within 90 days'}
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                {formatCurrency(expirySummary.valueAtRisk)}
              </div>
              <div className="text-[10px] text-text-muted font-medium">
                {expirySummary.within90dCount + expirySummary.expiredCount} {language === 'am' ? 'ባቾች' : 'batches affected'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* STANDARD KPI CARDS (BY ITEM / BY BATCH) */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Card 1: Expired */}
          <div
            onClick={() => setFilterTab(filterTab === 'expired' ? 'all' : 'expired')}
            className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
              filterTab === 'expired'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 ring-2 ring-rose-400/20'
                : 'bg-surface border-border-subtle hover:border-rose-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
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
                : 'bg-surface border-border-subtle hover:border-orange-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
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
                : 'bg-surface border-border-subtle hover:border-amber-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
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
                : 'bg-surface border-border-subtle hover:border-red-300'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
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
      )}

      {/* ─── 3. Sub-tabs & Search Toolbar ─── */}
      <div className="p-4 bg-surface border border-border-subtle rounded-2xl mb-4 flex flex-wrap items-center justify-between gap-3 shadow-card">
        {viewMode === 'expiry_list' ? (
          /* EXPIRY LIST TOOLBAR */
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Quick Chips */}
              <div className="inline-flex rounded-xl bg-surface-2 p-0.5 text-xs font-bold">
                {(['all', 'expired', '7d', '30d', '90d', 'ok'] as const).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setExpiryChip(chip)}
                    className={`px-2.5 py-1 rounded-lg transition ${
                      expiryChip === chip
                        ? 'bg-white dark:bg-surface-2 text-text-main shadow-xs'
                        : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    {chip === 'all'
                      ? t('inventory.chipAll')
                      : chip === 'expired'
                      ? t('inventory.chipExpired')
                      : chip === '7d'
                      ? t('inventory.chipWithin7d')
                      : chip === '30d'
                      ? t('inventory.chipWithin30d')
                      : chip === '90d'
                      ? t('inventory.chipWithin3m')
                      : t('inventory.chipOk')}
                  </button>
                ))}
              </div>

              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-2.5 py-1 rounded-xl bg-input border border-border-subtle text-[14px] font-semibold text-text-main"
              >
                <option value="">{language === 'am' ? 'ሁሉም ምድቦች' : 'All Categories'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en} {c.name_am ? `(${c.name_am})` : ''}
                  </option>
                ))}
              </select>

              {/* Supplier Filter */}
              <select
                value={selectedSupplier}
                onChange={(e) => setSelectedSupplier(e.target.value)}
                className="px-2.5 py-1 rounded-xl bg-input border border-border-subtle text-[14px] font-semibold text-text-main"
              >
                <option value="">{t('inventory.allSuppliers')}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Date Range Inputs */}
              <div className="flex items-center gap-1 text-[11px] font-semibold text-text-muted">
                <input
                  type="date"
                  value={expiryStartDate}
                  onChange={(e) => setExpiryStartDate(e.target.value)}
                  placeholder="Start"
                  className="px-2 py-0.5 rounded-lg bg-surface-2 border border-border-subtle text-xs font-mono"
                />
                <span>-</span>
                <input
                  type="date"
                  value={expiryEndDate}
                  onChange={(e) => setExpiryEndDate(e.target.value)}
                  placeholder="End"
                  className="px-2 py-0.5 rounded-lg bg-surface-2 border border-border-subtle text-xs font-mono"
                />
              </div>
            </div>

            {/* Actions: Search + Bulk Select + Export */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search product, batch, barcode..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 pr-3 py-1 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main w-48 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Bulk Actions */}
              {selectedBatchIds.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleOpenBulkWriteOff}
                    className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1 transition shadow-xs"
                  >
                    <Trash2 size={13} />
                    <span>{t('inventory.writeOffExpired')} ({selectedBatchIds.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBatchIds([])}
                    className="px-2 py-1 rounded-xl bg-surface-2 text-text-main text-xs font-semibold"
                  >
                    {t('inventory.clearSelection')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSelectAllExpired}
                  className="px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition hover:bg-rose-100"
                >
                  {t('inventory.selectExpiredOnly')}
                </button>
              )}

              {/* Export Buttons */}
              <button
                type="button"
                onClick={handleExportExpiryExcel}
                title={t('inventory.exportExcel')}
                className="px-2.5 py-1 rounded-xl bg-surface-2 hover:bg-surface-2 text-text-main text-xs font-bold flex items-center gap-1 transition"
              >
                <FileSpreadsheet size={13} className="text-primary" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                type="button"
                onClick={handleExportExpiryPdf}
                title={t('inventory.exportPdf')}
                className="px-2.5 py-1 rounded-xl bg-surface-2 hover:bg-surface-2 text-text-main text-xs font-bold flex items-center gap-1 transition"
              >
                <Printer size={13} className="text-blue-600" />
                <span className="hidden sm:inline">PDF</span>
              </button>
              <button
                type="button"
                onClick={fetchExpiryData}
                title="Refresh"
                className="p-1.5 rounded-xl bg-surface-2 hover:bg-surface-2 text-text-muted transition"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </>
        ) : (
          /* STANDARD ITEM & BATCH TOOLBAR */
          <>
            {/* Left: Four Filter Tabs */}
            <div className="inline-flex rounded-xl bg-surface-2 p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition ${
                  filterTab === 'all'
                    ? 'bg-white dark:bg-surface-2 text-text-main shadow-xs'
                    : 'text-text-muted'
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
                    : 'text-text-muted'
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
                    : 'text-text-muted'
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
                    : 'text-text-muted'
                }`}
              >
                {t('inventory.expired')}
              </button>
            </div>

            {/* Right: Search, Category, Refresh */}
            <div className="flex flex-1 items-center gap-2 justify-end min-w-[260px]">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search item, barcode, batch..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-input border border-border-subtle text-[14px] font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-primary"
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
                className="p-2 rounded-xl bg-surface-2 hover:bg-surface-2 text-text-muted transition"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* ─── 4. Main Table View ─── */}
      <div className="min-h-[480px] md:min-h-0 shrink-0 md:shrink flex-1 bg-surface border border-border-subtle rounded-2xl overflow-hidden flex flex-col shadow-xs">
        <div className="flex-1 overflow-auto">
          {viewMode === 'item' ? (
            /* ── VIEW 1: BY ITEM ── */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-2 text-[11px] font-extrabold text-text-muted uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3.5 pl-5">Item</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5 text-right">Quantity on Hand</th>
                  <th className="p-3.5 text-center">{t('inventory.nearestExpiry')}</th>
                  <th className="p-3.5 text-center">{t('inventory.daysLeft')}</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-medium">
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-text-muted">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
                      Loading inventory items...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-text-muted">
                      <Package size={36} className="mx-auto mb-2 text-text-muted dark:text-text-main" />
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
                      <tr key={p.id} className="hover:bg-surface-2 dark:hover:bg-surface/40 transition">
                        {/* Item */}
                        <td className="p-3.5 pl-5">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl ${
                                p.image_url ? 'bg-surface-2' : initialStyle.bg
                              } border border-border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-xs`}
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
                              <div className="font-bold text-text-main flex items-center gap-2">
                                {p.name_en}
                              </div>
                              {p.name_am && (
                                <div className="text-[11px] text-text-muted font-sans">{p.name_am}</div>
                              )}
                              <div className="text-[10px] font-mono text-text-muted">
                                SKU: {p.sku}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="p-3.5 text-text-muted font-medium">
                          {p.category_name || 'General'}
                        </td>

                        {/* Quantity on Hand with Unit */}
                        <td className="p-3.5 text-right font-mono font-bold text-text-main">
                          <span>{onHand.toFixed(2)}</span>{' '}
                          <span className="text-[10px] text-text-muted font-sans">{p.uom_code || 'PCS'}</span>
                        </td>

                        {/* Nearest Expiry Date */}
                        <td className="p-3.5 text-center font-mono text-xs text-text-muted">
                          {p.nearest_expiry ? p.nearest_expiry.slice(0, 10) : '—'}
                        </td>

                        {/* Days Left Badge with Icon & Text */}
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              expStatus.tier === 'NO_EXPIRY'
                                ? 'bg-surface-2 text-text-muted'
                                : expStatus.tier === 'EXPIRED' || expStatus.tier === 'TODAY'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200'
                                : expStatus.tier === 'CRITICAL'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200'
                                : expStatus.tier === 'WARNING'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200'
                                : 'bg-primary-soft/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                            }`}
                          >
                            {expStatus.tier === 'EXPIRED' && <AlertOctagon size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'TODAY' && <Clock size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'CRITICAL' && <AlertTriangle size={12} className="text-orange-600 shrink-0" />}
                            {expStatus.tier === 'WARNING' && <Calendar size={12} className="text-amber-600 shrink-0" />}
                            {expStatus.tier === 'GOOD' && <CheckCircle2 size={12} className="text-primary shrink-0" />}
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
                            <span className="px-2 py-0.5 rounded-full bg-surface-2 text-text-muted text-[10px] font-bold">
                              {t('inventory.outOfStock')}
                            </span>
                          ) : isLow ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950 text-orange-600 text-[10px] font-bold">
                              {t('inventory.lowStockThreshold', { count: min })}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary text-[10px] font-bold">
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
                              className="px-2.5 py-1 rounded-lg bg-surface-2 hover:bg-surface-2 text-text-main text-xs font-bold flex items-center gap-1 transition"
                            >
                              <FileEdit size={12} className="text-amber-500" />
                              {t('inventory.adjustStock')}
                            </button>

                            {/* Count Stock (Inline Single Item) */}
                            <button
                              type="button"
                              onClick={() => handleOpenCount(p)}
                              title={t('inventory.countStock')}
                              className="px-2.5 py-1 rounded-lg bg-primary-soft hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <ClipboardList size={12} className="text-primary" />
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
                              className="p-1 rounded-lg bg-surface-2 hover:bg-surface-2 text-text-muted transition"
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
          ) : viewMode === 'batch' ? (
            /* ── VIEW 2: BY BATCH (EXPIRY-FIRST VIEW) ── */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-2 text-[11px] font-extrabold text-text-muted uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3.5 pl-5">Batch Number</th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5 text-right">Quantity</th>
                  <th className="p-3.5 text-center">Expiry Date</th>
                  <th className="p-3.5 text-center">Days Remaining</th>
                  <th className="p-3.5 text-right">Potential Loss</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-medium">
                {loading && batches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-text-muted">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-primary" />
                      Loading inventory batches...
                    </td>
                  </tr>
                ) : filteredBatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-text-muted">
                      <Calendar size={36} className="mx-auto mb-2 text-text-muted dark:text-text-main" />
                      No batches match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredBatches.map((b) => {
                    const days = computeDaysLeftInAddis(b.expiryDate) ?? b.daysUntilExpiry;
                    const expStatus = getExpiryStatus(b.expiryDate, 30);
                    const isExpired = days <= 0;

                    return (
                      <tr key={b.batchId} className="hover:bg-surface-2 dark:hover:bg-surface/40 transition">
                        <td className="p-3.5 pl-5 font-mono font-bold text-text-main text-text-main">
                          {b.batchNumber}
                        </td>
                        <td className="p-3.5 font-bold text-text-main">
                          {b.productName}
                        </td>
                        <td className="p-3.5 text-right font-mono font-bold">
                          {b.quantityOnHand} <span className="text-[10px] text-text-muted">{b.uom}</span>
                        </td>
                        <td className="p-3.5 text-center font-mono">
                          {b.expiryDate ? b.expiryDate.slice(0, 10) : '—'}
                        </td>
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              expStatus.tier === 'NO_EXPIRY'
                                ? 'bg-surface-2 text-text-muted'
                                : expStatus.tier === 'EXPIRED' || expStatus.tier === 'TODAY'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200'
                                : expStatus.tier === 'CRITICAL'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200'
                                : expStatus.tier === 'WARNING'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200'
                                : 'bg-primary-soft/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                            }`}
                          >
                            {expStatus.tier === 'EXPIRED' && <AlertOctagon size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'TODAY' && <Clock size={12} className="text-rose-600 shrink-0" />}
                            {expStatus.tier === 'CRITICAL' && <AlertTriangle size={12} className="text-orange-600 shrink-0" />}
                            {expStatus.tier === 'WARNING' && <Calendar size={12} className="text-amber-600 shrink-0" />}
                            {expStatus.tier === 'GOOD' && <CheckCircle2 size={12} className="text-primary shrink-0" />}
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
          ) : (
            /* ── VIEW 3: FULL EXPIRY LIST WITH THUMBNAIL, RECEIVED DATE, CLEARANCE & BULK ACTIONS ── */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-2 text-[11px] font-extrabold text-text-muted uppercase tracking-wider sticky top-0 z-10">
                  <th className="p-3.5 pl-4 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleSelectAllVisible}
                      title={selectedBatchIds.length === expiryBatches.length && expiryBatches.length > 0 ? t('inventory.clearSelection') : t('inventory.selectAll')}
                      className="text-text-muted hover:text-text-muted hover:text-text-main"
                    >
                      {selectedBatchIds.length > 0 && selectedBatchIds.length === expiryBatches.length ? (
                        <CheckSquare size={16} className="text-primary" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="p-3.5 w-14 text-center">{t('inventory.photoThumbnail')}</th>
                  <th className="p-3.5">{t('catalog.productName')}</th>
                  <th className="p-3.5">{t('catalog.category')}</th>
                  <th className="p-3.5">{t('inventory.batchNumber')}</th>
                  <th className="p-3.5 text-right">{t('inventory.stockOnHand')}</th>
                  <th className="p-3.5 text-center">{t('inventory.dateAdded')}</th>
                  <th className="p-3.5 text-center">{t('inventory.expiryDate')}</th>
                  <th className="p-3.5 text-center">{t('inventory.daysLeftHeader')}</th>
                  <th className="p-3.5 text-center">{t('common.status')}</th>
                  <th className="p-3.5 pr-5 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle font-medium">
                {loading && expiryBatches.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-text-muted">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-rose-600" />
                      {language === 'am' ? 'የጊዜ ማብቂያ ዝርዝር በመጫን ላይ...' : 'Loading expiry list...'}
                    </td>
                  </tr>
                ) : expiryBatches.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-text-muted">
                      <Clock size={36} className="mx-auto mb-2 text-text-muted dark:text-text-main" />
                      {t('inventory.noBatchesFound')}
                    </td>
                  </tr>
                ) : (
                  expiryBatches.map((b) => {
                    const isSelected = selectedBatchIds.includes(b.batchId);
                    const initialStyle = getInitialColor(b.productName || 'Batch');
                    const isExpired = b.stage === 'EXPIRED';

                    return (
                      <tr
                        key={b.batchId}
                        className={`transition ${
                          isExpired
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70'
                            : isSelected
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20'
                            : 'hover:bg-surface-2 dark:hover:bg-surface/40'
                        }`}
                      >
                        {/* 1. Checkbox */}
                        <td className="p-3.5 pl-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectBatch(b.batchId)}
                            className="text-text-muted hover:text-text-muted"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-primary" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td>

                        {/* 2. Photo thumbnail */}
                        <td className="p-3.5 text-center">
                          <div
                            className={`w-9 h-9 mx-auto rounded-xl ${
                              b.photoPath ? 'bg-surface-2' : initialStyle.bg
                            } border border-border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-xs`}
                          >
                            {b.photoPath ? (
                              <img
                                src={`/api/media/products/${b.productId}/160`}
                                alt={b.productName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className={`font-black text-xs ${initialStyle.text}`}>
                                {b.productName.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. Product Name */}
                        <td className="p-3.5">
                          <div className="font-bold text-text-main">
                            {b.productName}
                          </div>
                          {b.productNameAm && (
                            <div className="text-[11px] text-text-muted font-sans">{b.productNameAm}</div>
                          )}
                          <div className="text-[10px] font-mono text-text-muted">
                            SKU: {b.sku} {b.supplierName && `• ${b.supplierName}`}
                          </div>
                        </td>

                        {/* 4. Category */}
                        <td className="p-3.5 text-text-muted font-medium">
                          {b.categoryName || 'General'}
                        </td>

                        {/* 5. Batch Number */}
                        <td className="p-3.5 font-mono font-bold text-text-main text-text-main">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{b.batchNumber}</span>
                            {b.clearancePrice && b.clearancePrice > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-100 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-[10px] font-bold font-sans">
                                <Tag size={10} className="text-amber-600" />
                                {t('inventory.clearanceBadge')} {b.clearancePrice.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Quantity on Hand */}
                        <td className="p-3.5 text-right font-mono font-bold text-text-main">
                          <span>{b.currentQuantity}</span>{' '}
                          <span className="text-[10px] text-text-muted font-sans">{b.uomCode}</span>
                        </td>

                        {/* 7. Date Added (Received) */}
                        <td className="p-3.5 text-center font-mono text-text-muted">
                          {formatBatchDate(b.receivedDate)}
                        </td>

                        {/* 8. Expiry Date */}
                        <td className={`p-3.5 text-center font-mono font-bold ${
                          isExpired ? 'text-rose-600 dark:text-rose-400' : 'text-text-main'
                        }`}>
                          {formatBatchDate(b.expiryDate)}
                        </td>

                        {/* 9. Days Left text */}
                        <td className="p-3.5 text-center font-bold">
                          <span className={`text-xs ${
                            isExpired
                              ? 'text-rose-600'
                              : b.stage === '7D'
                              ? 'text-orange-600'
                              : b.stage === '30D'
                              ? 'text-amber-600'
                              : b.stage === '90D'
                              ? 'text-yellow-600'
                              : 'text-primary'
                          }`}>
                            {language === 'am' ? b.humanTextAm : b.humanTextEn}
                          </span>
                        </td>

                        {/* 10. Status Badge */}
                        <td className="p-3.5 text-center">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              b.stage === 'EXPIRED'
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300'
                                : b.stage === '7D'
                                ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-300'
                                : b.stage === '30D'
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300'
                                : b.stage === '90D'
                                ? 'bg-yellow-100 dark:bg-yellow-950/60 text-yellow-800 dark:text-yellow-200 border border-yellow-300'
                                : 'bg-primary-soft/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300'
                            }`}
                          >
                            {b.stage === 'EXPIRED' && <AlertOctagon size={12} className="text-rose-600 shrink-0" />}
                            {b.stage === '7D' && <AlertTriangle size={12} className="text-orange-600 shrink-0" />}
                            {b.stage === '30D' && <Clock size={12} className="text-amber-600 shrink-0" />}
                            {b.stage === '90D' && <AlertCircle size={12} className="text-yellow-600 shrink-0" />}
                            {b.stage === 'OK' && <CheckCircle2 size={12} className="text-primary shrink-0" />}
                            <span>
                              {b.stage === 'EXPIRED'
                                ? t('inventory.chipExpired')
                                : b.stage === '7D'
                                ? t('inventory.chipWithin7d')
                                : b.stage === '30D'
                                ? t('inventory.chipWithin30d')
                                : b.stage === '90D'
                                ? t('inventory.chipWithin3m')
                                : t('inventory.chipOk')}
                            </span>
                          </span>
                        </td>

                        {/* 11. Actions */}
                        <td className="p-3.5 pr-5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Clearance Markdown */}
                            <button
                              type="button"
                              onClick={() => handleOpenClearance(b)}
                              title={t('inventory.clearanceMarkdown')}
                              className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1 border border-amber-200 dark:border-amber-800 transition"
                            >
                              <Tag size={12} className="text-amber-600" />
                              <span className="hidden lg:inline">{t('inventory.rowActionMarkdown')}</span>
                            </button>

                            {/* Write-off */}
                            {isExpired && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBatchIds([b.batchId]);
                                  setIsBulkWriteOffOpen(true);
                                }}
                                title={t('inventory.writeOffExpired')}
                                className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800 transition"
                              >
                                <Trash2 size={12} className="text-rose-600" />
                                <span className="hidden lg:inline">{t('inventory.rowActionWriteOff')}</span>
                              </button>
                            )}

                            {/* Adjust */}
                            <button
                              type="button"
                              onClick={() => {
                                const prod = products.find((p) => p.id === b.productId);
                                if (prod) handleOpenAdjustment(prod);
                              }}
                              title={t('inventory.adjustStock')}
                              className="p-1 rounded-lg bg-surface-2 hover:bg-surface-2 text-text-muted transition"
                            >
                              <FileEdit size={13} />
                            </button>

                            {/* View Item */}
                            <button
                              type="button"
                              onClick={() => {
                                const prod = products.find((p) => p.id === b.productId);
                                if (prod) {
                                  setSelectedDrawerProduct(prod);
                                  setIsDrawerOpen(true);
                                }
                              }}
                              title={t('inventory.rowActionView')}
                              className="p-1 rounded-lg bg-surface-2 hover:bg-surface-2 text-text-muted transition"
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
          <div className="bg-surface rounded-2xl shadow-card border border-border-subtle w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-soft text-primary flex items-center justify-center">
                  <ClipboardList size={20} />
                </div>
                <div>
                  <h3 className="text-[20px] font-extrabold text-text-main">
                    {t('inventory.countStockModalTitle')}
                  </h3>
                  <p className="text-[15px] font-semibold text-text-muted">{countTarget.name_en}</p>
                </div>
              </div>
              <button
                onClick={() => setCountTarget(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
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
              <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle space-y-3">
                <div className="flex items-center justify-between text-[15px]">
                  <span className="text-text-muted">{t('inventory.systemQuantity')}</span>
                  <span className="font-mono font-bold text-text-main">
                    {Number(countTarget.stock_on_hand || 0).toFixed(2)} {countTarget.uom_code}
                  </span>
                </div>

                <div>
                  <label className="text-[15px] font-bold text-text-main block mb-1.5">
                    {t('inventory.countedQuantity')} *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-input border border-primary font-mono text-[16px] font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-primary shadow-xs"
                  />
                </div>

                {/* Variance Computed Display */}
                {(() => {
                  const sys = Number(countTarget.stock_on_hand || 0);
                  const counted = parseFloat(countedQty) || 0;
                  const variance = counted - sys;
                  return (
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-border-subtle">
                      <span className="font-bold text-text-muted">{t('inventory.variance')}</span>
                      <span
                        className={`font-mono font-black ${
                          variance === 0
                            ? 'text-primary'
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
                <label className="text-[15px] font-bold text-text-main block mb-1.5">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical inventory count verified"
                  value={countReason}
                  onChange={(e) => setCountReason(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-input border border-border-subtle text-[15px] font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCountTarget(null)}
                  className="px-5 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-[15px] font-bold text-text-main transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={countSubmitting}
                  className="px-6 py-2.5 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white text-[16px] font-bold transition flex items-center gap-2 shadow-soft"
                >
                  {countSubmitting && <RefreshCw size={13} className="animate-spin" />}
                  Confirm Stock Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 7. Unified Stock Adjustment Modal ─── */}
      <StockAdjustmentModal
        isOpen={isAdjModalOpen}
        product={products.find((p) => p.id === adjProductId) || null}
        onClose={() => setIsAdjModalOpen(false)}
        onSuccess={(msg) => {
          setSuccessMsg(msg);
          setIsAdjModalOpen(false);
          fetchData();
          setTimeout(() => setSuccessMsg(null), 4000);
        }}
      />
      {/* ─── 8. Write Off Expired Batch Modal ─── */}
      {writeOffBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-2xl shadow-card border border-border-subtle w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('inventory.writeOffExpired')}
                  </h3>
                  <p className="text-xs text-text-muted font-mono">
                    {writeOffBatch.productName} • Batch #{writeOffBatch.batchNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setWriteOffBatch(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
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
              <p className="text-[11px] text-text-muted font-mono">
                {language === 'am' ? 'የሚጣለው ዋጋ፡' : 'Potential loss value:'}{' '}
                {writeOffBatch.potentialLossValue.toFixed(2)} ETB ({writeOffBatch.quantityOnHand} {writeOffBatch.uom})
              </p>
            </div>

            <div>
              <label className="text-[15px] font-bold text-text-main block mb-1.5">
                {t('inventory.writeOffReason')} *
              </label>
              <input
                type="text"
                required
                value={writeOffReason}
                onChange={(e) => setWriteOffReason(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWriteOffBatch(null)}
                className="px-5 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-[15px] font-bold text-text-main transition"
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

      {/* ─── 9. Clearance Markdown Modal ─── */}
      {clearanceModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-2xl shadow-card border border-border-subtle w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950 text-amber-600 flex items-center justify-center">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('inventory.clearanceMarkdown')}
                  </h3>
                  <p className="text-xs text-text-muted font-mono">
                    {clearanceModalBatch.productName} • Batch #{clearanceModalBatch.batchNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setClearanceModalBatch(null)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {clearanceError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{clearanceError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-surface-2/60 border border-border-subtle text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">{language === 'am' ? 'የተለመደ መሸጫ ዋጋ፡' : 'Regular Base Price:'}</span>
                <span className="font-mono font-bold text-text-main">
                  {clearanceModalBatch.basePrice.toFixed(2)} ETB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('inventory.stockOnHand')}:</span>
                <span className="font-mono font-bold text-text-main">
                  {clearanceModalBatch.currentQuantity} {clearanceModalBatch.uomCode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">{t('inventory.expiryDate')}:</span>
                <span className="font-mono font-bold text-rose-600">
                  {formatBatchDate(clearanceModalBatch.expiryDate)}
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitClearance} className="space-y-3.5">
              <div>
                <label className="text-[15px] font-bold text-text-main block mb-1.5">
                  {t('inventory.clearancePrice')} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={clearancePriceInput}
                  onChange={(e) => setClearancePriceInput(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold font-mono text-text-main focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[15px] font-bold text-text-main block mb-1.5">
                    {t('inventory.clearanceStartDate')}
                  </label>
                  <input
                    type="date"
                    value={clearanceStartInput}
                    onChange={(e) => setClearanceStartInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono text-text-main"
                  />
                </div>
                <div>
                  <label className="text-[15px] font-bold text-text-main block mb-1.5">
                    {t('inventory.clearanceEndDate')}
                  </label>
                  <input
                    type="date"
                    value={clearanceEndInput}
                    onChange={(e) => setClearanceEndInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-surface-2 border border-border-subtle text-xs font-mono text-text-main"
                  />
                </div>
              </div>

              <div>
                <label className="text-[15px] font-bold text-text-main block mb-1.5">
                  {t('inventory.clearanceReason')}
                </label>
                <input
                  type="text"
                  value={clearanceReasonInput}
                  onChange={(e) => setClearanceReasonInput(e.target.value)}
                  placeholder="e.g. Expiring in 5 days clearance promotion"
                  className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClearanceModalBatch(null)}
                  className="px-5 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-[15px] font-bold text-text-main transition"
                >
                  {language === 'am' ? 'ሰርዝ' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={clearanceSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                >
                  {clearanceSubmitting && <RefreshCw size={13} className="animate-spin" />}
                  {language === 'am' ? 'የክሊራንስ ዋጋ መዝግብ' : 'Save Clearance Price'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 10. Bulk Write-Off Expired Batches Modal ─── */}
      {isBulkWriteOffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-surface rounded-2xl shadow-card border border-border-subtle w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950 text-rose-600 flex items-center justify-center">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-text-main">
                    {t('inventory.bulkWriteOffTitle')}
                  </h3>
                  <p className="text-xs text-text-muted font-mono">
                    {selectedBatchIds.length} {language === 'am' ? 'ባቾች ተመርጠዋል' : 'batches selected'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBulkWriteOffOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 flex items-center justify-center text-text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {bulkWriteOffError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{bulkWriteOffError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 space-y-2">
              <p className="font-semibold">
                {t('inventory.bulkWriteOffConfirm', {
                  count: selectedBatchIds.length,
                  cost: selectedBatchesInfo.totalCost.toFixed(2),
                })}
              </p>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {selectedBatchesInfo.selected.map((b) => (
                  <div key={b.batchId} className="flex justify-between text-[11px] border-b border-rose-200/50 dark:border-rose-900/40 pb-1">
                    <span className="truncate max-w-[200px]">{b.productName} ({b.batchNumber})</span>
                    <span className="font-mono font-bold shrink-0">{b.currentQuantity} {b.uomCode} • {b.totalCost.toFixed(2)} ETB</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[15px] font-bold text-text-main block mb-1.5">
                {t('inventory.writeOffReason')} *
              </label>
              <input
                type="text"
                required
                value={bulkWriteOffReason}
                onChange={(e) => setBulkWriteOffReason(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface-2 border border-border-subtle text-xs font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkWriteOffOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-surface hover:bg-surface-2 border border-border-subtle text-[15px] font-bold text-text-main transition"
              >
                {language === 'am' ? 'ሰርዝ' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={bulkWriteOffSubmitting}
                onClick={handleSubmitBulkWriteOff}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                {bulkWriteOffSubmitting && <RefreshCw size={13} className="animate-spin" />}
                {t('inventory.writeOffExpired')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
