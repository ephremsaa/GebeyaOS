import React, { useState } from 'react';
import { Edit3, Plus, Trash2, CheckCircle2, AlertTriangle, X, Search, Calendar, Clock, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../utils/pos-api';
import {
  getDatePlusOffset,
  validateExpiryDateInput,
  getAddisTodayString,
  formatEthiopianDisplayDate,
} from '@gebeyaos/shared-types';

export interface ManualStockProduct {
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
  isVat?: boolean;
  stockOnHand?: number;
  stock_on_hand?: number;
  minStock?: number;
  min_stock_level?: number;
  isWeighed?: boolean;
  is_weighed?: boolean;
  has_expiry_date?: boolean;
  hasExpiryDate?: boolean;
}

interface ManualDraftRow {
  productId: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  category: string;
  unit: string;
  quantity: number;
  unitCost: number;
  batchNumber: string;
  expiryDate: string;
  isPerishable: boolean;
}

interface ManualStockDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onCommitSuccess: (message: string, updatedProducts: any[]) => void;
  existingProducts: any[];
}

export const ManualStockDrawer: React.FC<ManualStockDrawerProps> = ({
  isOpen,
  onClose,
  onCommitSuccess,
  existingProducts,
}) => {
  const { language, t, calendar } = useI18n();
  const { currentUser } = useAuth();

  const [rows, setRows] = useState<ManualDraftRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSelectProduct = (prod: any) => {
    const isPerishable = Boolean(prod.has_expiry_date || prod.hasExpiryDate);
    const defaultBatch = `M-${Date.now().toString().slice(-4)}`;
    const defaultExpiry = isPerishable ? getDatePlusOffset('+6m') : '';

    const newRow: ManualDraftRow = {
      productId: prod.id,
      sku: prod.sku || '',
      nameEn: prod.name_en || prod.nameEn || 'Item',
      nameAm: prod.name_am || prod.nameAm || '',
      category: prod.category_name || prod.category || 'General',
      unit: prod.is_weighed || prod.isWeighed ? 'KG' : 'PCS',
      quantity: 10,
      unitCost: Number(prod.cost_price || prod.costPrice || 0),
      batchNumber: defaultBatch,
      expiryDate: defaultExpiry,
      isPerishable,
    };

    setRows((prev) => [newRow, ...prev]);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setErrorMsg(null);
  };

  const handleQuickOffset = (idx: number, offset: '+7d' | '+30d' | '+3m' | '+6m' | '+1y') => {
    const newDate = getDatePlusOffset(offset);
    setRows((prev) =>
      prev.map((r, rIdx) => (rIdx === idx ? { ...r, expiryDate: newDate } : r)),
    );
  };

  const handleCommit = async () => {
    if (rows.length === 0) return;

    for (const r of rows) {
      if (r.quantity <= 0) {
        setErrorMsg(`Quantity must be greater than zero for ${r.nameEn}`);
        return;
      }
      if (r.isPerishable) {
        if (!r.expiryDate) {
          setErrorMsg(`${t('inventory.expiryDateRequired')}: ${r.nameEn}`);
          return;
        }
        const val = validateExpiryDateInput(r.expiryDate);
        if (!val.isValid) {
          setErrorMsg(`${r.nameEn}: ${language === 'am' ? val.warningAm : val.warning}`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const branchId = currentUser?.branchId;
      for (const r of rows) {
        await posApi.createBatch(
          {
            productId: r.productId,
            batchNumber: r.batchNumber.trim() || `M-${Date.now().toString().slice(-4)}`,
            expiryDate: r.expiryDate || undefined,
            unitCost: r.unitCost || 0,
            initialQuantity: r.quantity,
          },
          branchId,
        );
      }

      const totalQty = rows.reduce((acc, r) => acc + r.quantity, 0);
      const successMsg = t('inventory.manualIntakeSuccess', {
        count: rows.length,
        qty: totalQty,
      });

      onCommitSuccess(successMsg, existingProducts);
      setRows([]);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to persist batches to stock ledger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const searchResults = existingProducts.filter((p) => {
    const nameEn = (p.name_en || p.nameEn || '').toLowerCase();
    const nameAm = (p.name_am || p.nameAm || '').toLowerCase();
    const sku = (p.sku || '').toLowerCase();
    const barcode = (p.barcode || (p.barcodes && p.barcodes[0]) || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return nameEn.includes(q) || nameAm.includes(q) || sku.includes(q) || barcode.includes(q);
  });

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-5xl max-h-[92vh] flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
              <Edit3 size={20} />
            </div>
            <div>
              <h2 className="modal-title font-bold text-lg text-slate-900 dark:text-white">
                {language === 'am' ? 'በመዝገብ ዕቃ ማስገባት' : 'Manual Stock Entry'}
              </h2>
              <p className="text-xs text-slate-500">
                {language === 'am'
                  ? 'እቃዎችን ፈልገው ባች፣ የግዢ ዋጋ፣ እና የሚያበቃበት ቀን በመሙላት ወደ ክምችት ያስገቡ'
                  : 'Add products by search, assign batch numbers, unit costs, and expiry dates'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Searchable Dropdown */}
        <div className="relative my-4">
          <label className="field-label mb-1 font-semibold text-xs text-slate-700 dark:text-slate-300">
            {language === 'am' ? 'ዕቃ ፈልገው ይምረጡ' : 'Search & Add Product Line'}
          </label>
          <div className="search-bar-wrapper flex items-center gap-2 p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
            <Search size={16} className="text-blue-600" />
            <input
              type="text"
              className="search-input flex-1 bg-transparent text-xs outline-none"
              placeholder={
                language === 'am'
                  ? 'ዕቃ በስም፣ በSKU፣ ወይም በባርኮድ ይፈልጉ...'
                  : 'Search product by name, SKU, or barcode to add...'
              }
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {isDropdownOpen && searchQuery.length > 0 && (
            <div className="absolute top-16 left-0 right-0 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
              {searchResults.length === 0 ? (
                <div className="p-3 text-xs text-center text-slate-400">
                  {language === 'am' ? 'ምንም የሚዛመድ ዕቃ አልተገኘም' : 'No matching products found.'}
                </div>
              ) : (
                searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between text-left text-xs transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {language === 'am' && prod.name_am ? prod.name_am : prod.name_en || prod.nameEn}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {prod.sku} • {prod.category_name || prod.category || 'General'}
                        {Boolean(prod.has_expiry_date || prod.hasExpiryDate) && (
                          <span className="ml-1 text-amber-500 font-bold">
                            [{language === 'am' ? 'ጊዜ ገደብ አለው' : 'Has Expiry'}]
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-right tabular">
                      <span className="font-bold text-blue-600">
                        {prod.cost_price || prod.costPrice || 0} ETB
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        On Hand: {prod.stock_on_hand || prod.stockOnHand || 0}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="alert-danger text-xs p-3 rounded-xl mb-3 flex items-center gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600">
            <AlertTriangle size={15} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Draft Lines Table */}
        <div className="flex-1 overflow-y-auto glass-panel border border-slate-200 dark:border-slate-700 rounded-2xl min-h-[260px]">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
              <Edit3 size={36} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">
                {language === 'am' ? 'ምንም ረድፍ አልተጨመረም' : 'No draft lines added.'}
              </p>
              <p className="text-xs max-w-sm">
                {language === 'am'
                  ? 'ከላይ ያለውን መፈለጊያ ተጠቅመው ዕቃዎችን ይምረጡ። ከማስቀመጥዎ በፊት የፈለጉትን ያህል መስመሮች ማከል ይችላሉ።'
                  : 'Use the search field above to select items. You can add as many lines as needed before saving.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-500 uppercase">
                  <th className="p-3 pl-4">{language === 'am' ? 'ዕቃ' : 'Product Name'}</th>
                  <th className="p-3 text-right">{language === 'am' ? 'የግዢ ዋጋ' : 'Unit Cost'}</th>
                  <th className="p-3 text-center">{language === 'am' ? 'ብዛት' : 'Quantity'}</th>
                  <th className="p-3">{language === 'am' ? 'ባች #' : 'Batch Number'}</th>
                  <th className="p-3">{language === 'am' ? 'የሚያበቃበት ቀን' : 'Expiry Date'}</th>
                  <th className="p-3 text-center">{language === 'am' ? 'ተግባር' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row, idx) => {
                  const dateValidation = row.expiryDate
                    ? validateExpiryDateInput(row.expiryDate)
                    : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="p-3 pl-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {language === 'am' && row.nameAm ? row.nameAm : row.nameEn}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {row.sku} • {row.category}
                            {row.isPerishable && (
                              <span className="ml-1 text-amber-500 font-bold">
                                *{language === 'am' ? 'ቀን ያስፈልጋል' : 'Expiry required'}
                              </span>
                            )}
                          </span>
                        </div>
                      </td>

                      <td className="p-3 text-right tabular">
                        <input
                          type="number"
                          step="0.01"
                          className="w-24 p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-right text-xs font-mono font-bold"
                          value={row.unitCost}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setRows((prev) =>
                              prev.map((r, rIdx) => (rIdx === idx ? { ...r, unitCost: val } : r)),
                            );
                          }}
                        />
                      </td>

                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            className="w-16 p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-center font-bold text-xs font-mono"
                            value={row.quantity}
                            onChange={(e) => {
                              const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setRows((prev) =>
                                prev.map((r, rIdx) => (rIdx === idx ? { ...r, quantity: val } : r)),
                              );
                            }}
                          />
                          <span className="text-[10px] text-slate-400 font-bold">{row.unit}</span>
                        </div>
                      </td>

                      <td className="p-3">
                        <input
                          type="text"
                          className="w-28 p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-mono"
                          value={row.batchNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRows((prev) =>
                              prev.map((r, rIdx) => (rIdx === idx ? { ...r, batchNumber: val } : r)),
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
                                row.isPerishable && !row.expiryDate
                                  ? 'border-rose-500 bg-rose-50/20'
                                  : dateValidation?.warning
                                  ? 'border-amber-400 bg-amber-50/20'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                              }`}
                              value={row.expiryDate}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRows((prev) =>
                                  prev.map((r, rIdx) => (rIdx === idx ? { ...r, expiryDate: val } : r)),
                                );
                              }}
                            />
                            {/* Format hint / Ethiopian calendar */}
                            {row.expiryDate && calendar === 'ethiopic' && (
                              <span className="text-[10px] text-slate-500 font-sans">
                                ({formatEthiopianDisplayDate(row.expiryDate, language)})
                              </span>
                            )}
                          </div>

                          {/* Quick Offset Buttons */}
                          <div className="flex items-center gap-1 flex-wrap">
                            {(['+7d', '+30d', '+3m', '+6m', '+1y'] as const).map((off) => (
                              <button
                                key={off}
                                type="button"
                                onClick={() => handleQuickOffset(idx, off)}
                                className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[10px] font-bold text-slate-600 dark:text-slate-300 transition"
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

                          {/* Inline Warning for past or >5yr date */}
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
                          onClick={() => setRows((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
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

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
          <span className="text-xs font-semibold text-slate-500">
            {language === 'am' ? 'ጠቅላላ የሚገባ፡' : 'Total Draft:'}{' '}
            <strong className="text-slate-900 dark:text-white">
              {rows.reduce((acc, r) => acc + r.quantity, 0)} {language === 'am' ? 'እቃዎች' : 'units'}
            </strong>{' '}
            ({rows.length} {language === 'am' ? 'መስመሮች' : 'lines'})
          </span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition"
            >
              {language === 'am' ? 'ሰርዝ' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || isSubmitting}
              onClick={handleCommit}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>{language === 'am' ? 'በመመዝገብ ላይ...' : 'Saving to ledger...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>{language === 'am' ? 'አረጋግጥ እና አስገባ' : 'Save & Commit Stock'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
