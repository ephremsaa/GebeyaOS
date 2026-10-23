import React, { useState, useEffect } from 'react';
import {
  Truck,
  TrendingDown,
  ShoppingCart,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  ArrowRight,
  Package,
  Calendar,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { NavTabId } from '../NavigationRail';

interface ReorderItem {
  id: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  categoryName?: string;
  uomCode: string;
  costPrice: number;
  basePrice: number;
  minStockLevel: number;
  maxStockLevel: number;
  stockOnHand: number;
  dailySalesRate: number;
  daysRemaining: number;
  suggestedReorderQuantity: number;
  estimatedCost: number;
}

interface SupplierOption {
  id: string;
  name: string;
  code: string;
}

interface ReorderSuggestionsViewProps {
  onNavigateToPurchasing?: () => void;
}

export const ReorderSuggestionsView: React.FC<ReorderSuggestionsViewProps> = ({
  onNavigateToPurchasing,
}) => {
  const { language } = useI18n();
  const { currentUser } = useAuth();

  const [items, setItems] = useState<ReorderItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [creatingPo, setCreatingPo] = useState<boolean>(false);
  const [createdPoNumber, setCreatedPoNumber] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reorderRes, supRes] = await Promise.all([
        fetch('/api/products/reorder-suggestions'),
        fetch('/api/purchasing/suppliers'),
      ]);

      if (reorderRes.ok) {
        const data = await reorderRes.json();
        setItems(data || []);
        // Select all by default
        const all = new Set<string>((data || []).map((i: ReorderItem) => i.id));
        setSelectedIds(all);
      }
      if (supRes.ok) {
        const sups = await supRes.json();
        setSuppliers(sups || []);
        if (sups?.length > 0) setSelectedSupplierId(sups[0].id);
      }
    } catch (err) {
      console.error('Failed to load reorder suggestions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSelect = (id: string) => {
    const updated = new Set(selectedIds);
    if (updated.has(id)) updated.delete(id);
    else updated.add(id);
    setSelectedIds(updated);
  };

  const handleUpdateQty = (id: string, qty: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const safeQty = Math.max(1, qty);
          return {
            ...item,
            suggestedReorderQuantity: safeQty,
            estimatedCost: Number((safeQty * item.costPrice).toFixed(2)),
          };
        }
        return item;
      }),
    );
  };

  const handleGeneratePo = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one item to reorder.');
      return;
    }
    if (!selectedSupplierId) {
      alert('Please select a supplier for this Purchase Order.');
      return;
    }

    setCreatingPo(true);
    try {
      const selectedItems = items.filter((i) => selectedIds.has(i.id));
      const payload = {
        supplierId: selectedSupplierId,
        expectedDeliveryDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        notes: `Generated automatically from GebeyaOS Reorder Suggestions engine for ${selectedItems.length} low-stock SKUs.`,
        items: selectedItems.map((i) => ({
          productId: i.id,
          orderedQuantity: i.suggestedReorderQuantity,
          unitCost: i.costPrice,
          taxRate: 0.15,
        })),
      };

      const res = await fetch('/api/purchasing/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const po = await res.json();
        setCreatedPoNumber(po.orderNumber);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to create Purchase Order');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred creating PO');
    } finally {
      setCreatingPo(false);
    }
  };

  const selectedCount = selectedIds.size;
  const totalEstimatedCost = items
    .filter((i) => selectedIds.has(i.id))
    .reduce((sum, i) => sum + i.estimatedCost, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Truck className="text-amber-500" size={24} />
            {language === 'am' ? 'የእቃ ማዘዣ ጥቆማዎች' : 'Intelligent Reorder Suggestions'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'በቀን የሽያጭ ፍጥነት እና በአነስተኛ ክምችት ላይ ተመስርቶ የተሰላ አውቶማቲክ ማዘዣ'
              : 'Auto-calculated PO recommendations based on reorder points, current stock on hand, and 30-day sales velocity.'}
          </p>
        </div>

        <button
          onClick={fetchData}
          className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {language === 'am' ? 'አድስ' : 'Refresh'}
        </button>
      </div>

      {/* PO Generated Success Alert Banner */}
      {createdPoNumber && (
        <div className="mb-4 p-4 rounded-2xl bg-emerald-500 text-white shadow-sm flex items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div className="font-extrabold text-sm">
                Purchase Order Created Successfully: <span className="underline font-mono">{createdPoNumber}</span>
              </div>
              <div className="text-xs text-emerald-100">
                Draft PO is ready for supplier transmission and warehouse GRN intake.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onNavigateToPurchasing && (
              <button
                onClick={onNavigateToPurchasing}
                className="px-3.5 py-1.5 rounded-xl bg-white text-emerald-800 font-bold text-xs hover:bg-emerald-50 transition"
              >
                Go to Purchasing &rarr;
              </button>
            )}
            <button
              onClick={() => setCreatedPoNumber(null)}
              className="text-white/80 hover:text-white text-xs font-bold px-2 py-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 2. Reorder Action Toolbar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <div>
            <label className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">
              Target Supplier
            </label>
            <select
              value={selectedSupplierId}
              onChange={(e) => setSelectedSupplierId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">
              Selected SKUs
            </span>
            <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
              {selectedCount} / {items.length} items
            </span>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

          <div>
            <span className="text-[10px] font-extrabold uppercase text-slate-400 block mb-1">
              Total Estimated PO Cost
            </span>
            <span className="font-mono font-black text-amber-600 dark:text-amber-400 text-sm">
              {totalEstimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
            </span>
          </div>
        </div>

        <button
          onClick={handleGeneratePo}
          disabled={creatingPo || selectedCount === 0}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-50"
        >
          <ShoppingCart size={16} />
          {creatingPo ? 'Generating Draft...' : '1-Click Draft Purchase Order'}
        </button>
      </div>

      {/* 3. Items Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === items.length && items.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(items.map((i) => i.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="w-4 h-4 rounded text-gebeya-600"
                  />
                </th>
                <th className="py-3 px-4">Product Name & SKU</th>
                <th className="py-3 px-4 text-center">UOM</th>
                <th className="py-3 px-4 text-right">Current SOH</th>
                <th className="py-3 px-4 text-right">Min Trigger</th>
                <th className="py-3 px-4 text-right">Daily Sales Rate</th>
                <th className="py-3 px-4 text-center">Days Remaining</th>
                <th className="py-3 px-4 text-center">Suggested Order Qty</th>
                <th className="py-3 px-4 text-right">Unit Cost</th>
                <th className="py-3 px-4 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Calculating replenishment recommendations...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="inline-block text-emerald-500 mr-2" size={18} />
                    All stock levels healthy! No products currently below reorder thresholds.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isSelected = selectedIds.has(item.id);
                  const isDepleted = item.stockOnHand <= 0;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${
                        isSelected ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 rounded text-gebeya-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {item.nameEn}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400">
                          {item.sku} • {item.categoryName || 'General'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-400">
                        {item.uomCode}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={isDepleted ? 'text-rose-600 font-black' : 'text-amber-500'}>
                          {item.stockOnHand}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {item.minStockLevel}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {item.dailySalesRate > 0 ? `${item.dailySalesRate}/day` : '0/day'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            item.daysRemaining <= 2
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {item.daysRemaining > 90 ? '> 90 days' : `${item.daysRemaining} days`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.suggestedReorderQuantity}
                          onChange={(e) =>
                            handleUpdateQty(item.id, parseInt(e.target.value) || 1)
                          }
                          className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-bold text-xs"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        {item.costPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-slate-900 dark:text-white">
                        {item.estimatedCost.toFixed(2)} ETB
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
