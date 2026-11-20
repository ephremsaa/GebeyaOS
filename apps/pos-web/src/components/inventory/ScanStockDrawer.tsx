import React, { useState, useEffect, useRef } from 'react';
import {
  Scan,
  Camera,
  CameraOff,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  X,
  Volume2,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { audioFeedback } from '../../utils/audioFeedback';
import { posApi } from '../../utils/pos-api';
import {
  getDatePlusOffset,
  validateExpiryDateInput,
  getAddisTodayString,
  formatEthiopianDisplayDate,
} from '@gebeyaos/shared-types';

export interface ScanProductItem {
  id: string;
  sku: string;
  barcode?: string;
  barcodes?: string[];
  name_en?: string;
  nameEn?: string;
  name_am?: string | null;
  nameAm?: string | null;
  category?: string;
  category_name?: string;
  price?: number;
  base_price?: number;
  costPrice?: number;
  cost_price?: number;
  stockOnHand?: number;
  stock_on_hand?: number;
  minStock?: number;
  min_stock_level?: number;
  isWeighed?: boolean;
  is_weighed?: boolean;
  has_expiry_date?: boolean;
  hasExpiryDate?: boolean;
}

interface ScannedIntakeRow {
  barcode: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
  sellingPrice: number;
  batchNumber: string;
  expiryDate: string;
  isPerishable: boolean;
  highlighted?: boolean;
}

interface ScanStockDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitSuccess: (message: string, updatedProducts: any[]) => void;
  existingProducts: any[];
}

export const ScanStockDrawer: React.FC<ScanStockDrawerProps> = ({
  isOpen,
  onClose,
  onCommitSuccess,
  existingProducts,
}) => {
  const { language, t, calendar } = useI18n();
  const { currentUser } = useAuth();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [items, setItems] = useState<ScannedIntakeRow[]>([]);
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick Create State for unknown barcode
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Dairy & Eggs');
  const [newUnit, setNewUnit] = useState('PCS');
  const [newCost, setNewCost] = useState<number>(50);
  const [newPrice, setNewPrice] = useState<number>(65);
  const [newHasExpiry, setNewHasExpiry] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const keyBufferRef = useRef<string>('');

  // Keep focus on scan input
  useEffect(() => {
    if (isOpen && !unknownBarcode) {
      setTimeout(() => scanInputRef.current?.focus(), 100);
    }
  }, [isOpen, unknownBarcode]);

  // Handle hardware USB/Bluetooth barcode scanner wedges
  useEffect(() => {
    if (!isOpen || unknownBarcode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== scanInputRef.current && activeEl.tagName === 'INPUT') {
        return;
      }

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (keyBufferRef.current.length > 2) {
          processBarcode(keyBufferRef.current.trim());
          keyBufferRef.current = '';
          e.preventDefault();
        }
      } else if (e.key.length === 1) {
        if (diff > 50) {
          keyBufferRef.current = e.key;
        } else {
          keyBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, unknownBarcode, items, existingProducts]);

  const processBarcode = (scannedCode: string) => {
    if (!scannedCode) return;
    setBarcodeInput('');

    // Check if already in scanned intake list
    const existingIndex = items.findIndex((i) => i.barcode === scannedCode);
    if (existingIndex >= 0) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex
            ? { ...item, quantity: item.quantity + 1, highlighted: true }
            : { ...item, highlighted: false },
        ),
      );
      audioFeedback.playSuccess();
      return;
    }

    // Lookup in store catalog
    const product = existingProducts.find((p) => {
      const directBarcode = (p.barcode || '').toLowerCase();
      const barcodes = (p.barcodes || []).map((b: string) => b.toLowerCase());
      const sku = (p.sku || '').toLowerCase();
      const code = scannedCode.toLowerCase();
      return directBarcode === code || barcodes.includes(code) || sku === code;
    });

    if (product) {
      const isPerishable = Boolean(product.has_expiry_date || product.hasExpiryDate);
      const defaultBatch = `B-${Date.now().toString().slice(-4)}`;
      const defaultExpiry = isPerishable ? getDatePlusOffset('+6m') : '';

      const newRow: ScannedIntakeRow = {
        barcode: scannedCode,
        productId: product.id,
        sku: product.sku || '',
        nameEn: product.name_en || product.nameEn || 'Item',
        nameAm: product.name_am || product.nameAm || '',
        category: product.category_name || product.category || 'General',
        unit: product.is_weighed || product.isWeighed ? 'KG' : 'PCS',
        quantity: 1,
        unitCost: Number(product.cost_price || product.costPrice || 0),
        sellingPrice: Number(product.base_price || product.price || 0),
        batchNumber: defaultBatch,
        expiryDate: defaultExpiry,
        isPerishable,
        highlighted: true,
      };

      setItems((prev) => [newRow, ...prev.map((i) => ({ ...i, highlighted: false }))]);
      audioFeedback.playSuccess();
    } else {
      audioFeedback.playError();
      setUnknownBarcode(scannedCode);
      setNewName('');
      setNewCost(50);
      setNewPrice(65);
      setNewHasExpiry(false);
    }
  };

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcodeInput.trim()) {
      processBarcode(barcodeInput.trim());
    }
  };

  const handleQuickOffset = (idx: number, offset: '+7d' | '+30d' | '+3m' | '+6m' | '+1y') => {
    const newDate = getDatePlusOffset(offset);
    setItems((prev) =>
      prev.map((item, pIdx) => (pIdx === idx ? { ...item, expiryDate: newDate } : item)),
    );
  };

  const handleSaveUnknownProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unknownBarcode) return;

    try {
      // Create new product via API
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_en: newName,
          sku: `SKU-${unknownBarcode.slice(-6)}`,
          barcode: unknownBarcode,
          cost_price: newCost,
          base_price: newPrice,
          uom_code: newUnit,
          has_expiry_date: newHasExpiry,
        }),
      });

      const newProd = res.ok ? await res.json() : null;
      const prodId = newProd?.id || `prod-new-${Date.now()}`;

      const newProdRow: ScannedIntakeRow = {
        barcode: unknownBarcode,
        productId: prodId,
        sku: newProd?.sku || `SKU-${unknownBarcode.slice(-6)}`,
        nameEn: newName,
        category: newCategory,
        unit: newUnit,
        quantity: 1,
        unitCost: newCost,
        sellingPrice: newPrice,
        batchNumber: `B-${Date.now().toString().slice(-4)}`,
        expiryDate: newHasExpiry ? getDatePlusOffset('+6m') : '',
        isPerishable: newHasExpiry,
        highlighted: true,
      };

      setItems((prev) => [newProdRow, ...prev]);
      audioFeedback.playSuccess();
      setUnknownBarcode(null);
      setTimeout(() => scanInputRef.current?.focus(), 100);
    } catch {
      setUnknownBarcode(null);
    }
  };

  const handleCommit = async () => {
    if (items.length === 0) return;

    // Validate perishables have future expiry
    for (const item of items) {
      if (item.isPerishable) {
        if (!item.expiryDate) {
          setErrorMsg(`${t('inventory.expiryDateRequired')}: ${item.nameEn}`);
          return;
        }
        const val = validateExpiryDateInput(item.expiryDate);
        if (!val.isValid) {
          setErrorMsg(`${item.nameEn}: ${language === 'am' ? val.warningAm : val.warning}`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const branchId = currentUser?.branchId;
      for (const item of items) {
        await posApi.createBatch(
          {
            productId: item.productId,
            batchNumber: item.batchNumber.trim() || `B-${Date.now().toString().slice(-4)}`,
            expiryDate: item.expiryDate || undefined,
            unitCost: item.unitCost || 0,
            initialQuantity: item.quantity,
          },
          branchId,
        );
      }

      const totalQty = items.reduce((acc, i) => acc + i.quantity, 0);
      const successMsg = t('inventory.scanIntakeSuccess', {
        count: items.length,
        qty: totalQty,
      });

      onCommitSuccess(successMsg, existingProducts);
      setItems([]);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to persist batches to stock ledger');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-5xl max-h-[92vh] flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary text-white shadow-soft flex items-center justify-center shadow-md shadow-emerald-600/30">
              <Scan size={20} />
            </div>
            <div>
              <h2 className="modal-title font-bold text-lg text-text-main">
                {language === 'am' ? 'ባርኮድ በመቃኘት ዕቃ ማስገባት' : 'Scan-to-Add Stock'}
              </h2>
              <p className="text-xs text-text-muted">
                {language === 'am'
                  ? 'ባርኮዶችን በተከታታይ በመቃኘት ወይም በመፃፍ በቀጥታ ወደ ክምችት መዝገብ ያስገቡ'
                  : 'Continuous barcode scanning with batch assignment and stock ledger persistence'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scan Input Toolbar */}
        <div className="my-4">
          <form onSubmit={handleManualScanSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={scanInputRef}
                type="text"
                className="w-full px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-sm font-mono font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={
                  language === 'am'
                    ? 'ባርኮድ እዚህ ይቃኙ ወይም ይተይቡ...'
                    : 'Scan barcode with scanner or type and press Enter...'
                }
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
              <Scan size={18} className="absolute right-3.5 top-3 text-primary pointer-events-none" />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold transition"
            >
              {language === 'am' ? 'አክል' : 'Add'}
            </button>
          </form>
        </div>

        {errorMsg && (
          <div className="alert-danger text-xs p-3 rounded-xl mb-3 flex items-center gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600">
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Scanned Items Table */}
        <div className="flex-1 overflow-y-auto glass-panel border border-border-subtle rounded-2xl min-h-[260px]">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted gap-2">
              <Scan size={36} className="text-slate-300 dark:text-text-main animate-pulse" />
              <p className="text-sm font-semibold">
                {language === 'am' ? 'ለመቃኘት ዝግጁ ነው' : 'Ready to scan'}
              </p>
              <p className="text-xs max-w-sm">
                {language === 'am'
                  ? 'የእቃውን ባርኮድ ይቃኙ። እያንዳንዱ ስካን መጠኑን በራስ-ሰር ይጨምራል'
                  : 'Scan product barcodes. Consecutive scans will automatically increment line quantity.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-2 dark:bg-surface/80 text-[11px] font-bold text-text-muted uppercase">
                  <th className="p-3 pl-4">{language === 'am' ? 'ዕቃ' : 'Product'}</th>
                  <th className="p-3 text-center">{language === 'am' ? 'ብዛት' : 'Quantity'}</th>
                  <th className="p-3 text-right">{language === 'am' ? 'የግዢ ዋጋ' : 'Unit Cost'}</th>
                  <th className="p-3">{language === 'am' ? 'ባች #' : 'Batch'}</th>
                  <th className="p-3">{language === 'am' ? 'የሚያበቃበት ቀን' : 'Expiry Date'}</th>
                  <th className="p-3 text-center">{language === 'am' ? 'ተግባር' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {items.map((item, idx) => {
                  const dateValidation = item.expiryDate
                    ? validateExpiryDateInput(item.expiryDate)
                    : null;

                  return (
                    <tr
                      key={item.barcode + idx}
                      className={`hover:bg-surface-2/60 dark:hover:bg-surface/30 transition-colors ${
                        item.highlighted ? 'bg-emerald-50/40 dark:bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="p-3 pl-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-text-main">
                            {language === 'am' && item.nameAm ? item.nameAm : item.nameEn}
                          </span>
                          <span className="text-[10px] text-text-muted font-mono">
                            {item.barcode} • {item.sku}
                            {item.isPerishable && (
                              <span className="ml-1 text-amber-500 font-bold">
                                *{language === 'am' ? 'ቀን ያስፈልጋል' : 'Expiry required'}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setItems((prev) =>
                                prev.map((i, pIdx) =>
                                  pIdx === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i,
                                ),
                              );
                            }}
                            className="w-6 h-6 rounded-md bg-surface-2 hover:bg-surface-2 dark:bg-slate-700 text-text-main flex items-center justify-center font-bold"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="w-8 text-center font-mono font-bold text-sm text-text-main">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setItems((prev) =>
                                prev.map((i, pIdx) =>
                                  pIdx === idx ? { ...i, quantity: i.quantity + 1 } : i,
                                ),
                              );
                            }}
                            className="w-6 h-6 rounded-md bg-surface-2 hover:bg-surface-2 dark:bg-slate-700 text-text-main flex items-center justify-center font-bold"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-text-main text-text-main">
                        {item.unitCost} ETB
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          className="w-24 p-1.5 rounded-lg border border-border-subtle bg-surface text-xs font-mono"
                          value={item.batchNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) =>
                              prev.map((i, pIdx) => (pIdx === idx ? { ...i, batchNumber: val } : i)),
                            );
                          }}
                        />
                      </td>

                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="date"
                              className={`p-1.5 rounded-lg border text-xs font-mono ${
                                item.isPerishable && !item.expiryDate
                                  ? 'border-rose-500 bg-rose-50/20'
                                  : dateValidation?.warning
                                  ? 'border-amber-400 bg-amber-50/20'
                                  : 'border-border-subtle bg-surface'
                              }`}
                              value={item.expiryDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setItems((prev) =>
                                  prev.map((i, pIdx) => (pIdx === idx ? { ...i, expiryDate: val } : i)),
                                );
                              }}
                            />
                            {item.expiryDate && calendar === 'ethiopic' && (
                              <span className="text-[10px] text-text-muted font-sans">
                                ({formatEthiopianDisplayDate(item.expiryDate, language)})
                              </span>
                            )}
                          </div>

                          {/* Quick buttons */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {(['+7d', '+30d', '+3m', '+6m', '+1y'] as const).map((off) => (
                              <button
                                key={off}
                                type="button"
                                onClick={() => handleQuickOffset(idx, off)}
                                className="px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-2 text-[10px] font-bold text-text-muted transition"
                              >
                                {off === '+7d'
                                  ? t('inventory.dateOffset7d')
                                  : off === '+30d'
                                  ? t('inventory.dateOffset30d')
                                  : off === '+3m'
                                  ? t('inventory.dateOffset3m')
                                  : off === '+6m'
                                  ? t('inventory.dateOffset6m')
                                  : t('inventory.dateOffset1y')}
                              </button>
                            ))}
                          </div>

                          {dateValidation?.warning && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                              <AlertTriangle size={10} />
                              {dateValidation.isPast
                                ? t('inventory.dateWarningPast')
                                : t('inventory.dateWarning5Years')}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => setItems((prev) => prev.filter((_, pIdx) => pIdx !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                          title="Remove line"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border-subtle mt-4">
          <span className="text-xs font-semibold text-text-muted">
            {language === 'am' ? 'ጠቅላላ የተቃኙ፡' : 'Total Scanned:'}{' '}
            <strong className="text-text-main">
              {items.reduce((acc, i) => acc + i.quantity, 0)} {language === 'am' ? 'እቃዎች' : 'units'}
            </strong>{' '}
            ({items.length} {language === 'am' ? 'የተለያዩ እቃዎች' : 'items'})
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-bold text-text-main hover:bg-surface-2 transition"
            >
              {language === 'am' ? 'ሰርዝ' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={items.length === 0 || isSubmitting}
              onClick={handleCommit}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>{language === 'am' ? 'በመመዝገብ ላይ...' : 'Saving to ledger...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>{language === 'am' ? 'አረጋግጥ እና አስገባ' : 'Commit Stock Inflow'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Unknown Barcode Modal */}
        {unknownBarcode && (
          <div
            className="modal-overlay z-60"
            onClick={(e) => e.target === e.currentTarget && setUnknownBarcode(null)}
          >
            <div className="modal-content max-w-md p-6 bg-surface rounded-2xl shadow-2xl border border-border-subtle animate-in zoom-in-95 duration-100">
              <h2 className="modal-title font-bold text-base text-text-main">
                {language === 'am' ? 'ያልታወቀ ባርኮድ ተገኝቷል' : 'Unknown Barcode Detected'}
              </h2>
              <p className="text-xs text-text-muted mb-4">
                {language === 'am'
                  ? `ባርኮድ ${unknownBarcode} በመደብር ካታሎግ ውስጥ የለም። ፈጥነው መዝግበው መቃኘቱን ይቀጥሉ`
                  : `Barcode ${unknownBarcode} is not in your catalog. Quickly create it to continue scanning.`}
              </p>

              <form onSubmit={handleSaveUnknownProduct} className="flex flex-col gap-3">
                <div>
                  <label className="field-label text-xs font-semibold text-text-main">
                    {language === 'am' ? 'የእቃው ስም *' : 'Product Name *'}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Mama Milk 500ml"
                    className="w-full mt-1 p-2 rounded-xl border border-border-subtle bg-white dark:bg-slate-700 text-xs font-bold"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="field-label text-xs font-semibold text-text-main">
                      {language === 'am' ? 'ምድብ' : 'Category'}
                    </label>
                    <select
                      className="w-full mt-1 p-2 rounded-xl border border-border-subtle bg-white dark:bg-slate-700 text-xs"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                    >
                      <option value="Dairy & Eggs">Dairy &amp; Eggs</option>
                      <option value="Bakery & Grains">Bakery &amp; Grains</option>
                      <option value="Fresh Produce">Fresh Produce</option>
                      <option value="Beverages">Beverages</option>
                      <option value="Household">Household</option>
                      <option value="Meat & Butchery">Meat &amp; Butchery</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label text-xs font-semibold text-text-main">
                      {language === 'am' ? 'መለኪያ' : 'Unit'}
                    </label>
                    <select
                      className="w-full mt-1 p-2 rounded-xl border border-border-subtle bg-white dark:bg-slate-700 text-xs"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value)}
                    >
                      <option value="PCS">PCS</option>
                      <option value="KG">KG</option>
                      <option value="L">L</option>
                      <option value="PACK">PACK</option>
                      <option value="BOX">BOX</option>
                    </select>
                  </div>

                  <div>
                    <label className="field-label text-xs font-semibold text-text-main">
                      {language === 'am' ? 'የግዢ ዋጋ (ብር)' : 'Cost Price (ETB)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full mt-1 p-2 rounded-xl border border-border-subtle bg-white dark:bg-slate-700 text-xs font-mono font-bold"
                      value={newCost}
                      onChange={(e) => setNewCost(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <div>
                    <label className="field-label text-xs font-semibold text-text-main">
                      {language === 'am' ? 'የመሸጫ ዋጋ (ብር)' : 'Shelf Price (ETB)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full mt-1 p-2 rounded-xl border border-border-subtle bg-white dark:bg-slate-700 text-xs font-mono font-bold"
                      value={newPrice}
                      onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="newHasExpiry"
                    checked={newHasExpiry}
                    onChange={(e) => setNewHasExpiry(e.target.checked)}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <label htmlFor="newHasExpiry" className="text-xs font-semibold text-text-main cursor-pointer">
                    {language === 'am' ? 'የሚያበቃበት ቀን አለው (የሚበላሽ ዕቃ)' : 'Has expiry date (Perishable product)'}
                  </label>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl border border-border-subtle text-xs font-bold text-text-muted flex-1 hover:bg-surface-2 transition"
                    onClick={() => setUnknownBarcode(null)}
                  >
                    {language === 'am' ? 'ዝለል' : 'Skip'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl btn-primary bg-primary hover:bg-primary-hover text-white shadow-soft text-xs font-bold flex-1 transition"
                  >
                    {language === 'am' ? 'መዝግብ እና ቀጥል' : 'Add & Resume'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
