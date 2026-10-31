import React, { useState } from 'react';
import { Edit3, Plus, Trash2, CheckCircle2, AlertTriangle, X, Search } from 'lucide-react';

export interface ManualStockProduct {
  id: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  category?: string;
  price?: number;
  costPrice?: number;
  isVat?: boolean;
  stockOnHand?: number;
  minStock?: number;
  isWeighed?: boolean;
}

interface ManualDraftRow {
  productId: string;
  sku: string;
  nameEn: string;
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
  const [rows, setRows] = useState<ManualDraftRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectProduct = (prod: ManualStockProduct) => {
    const categoryName = prod.category || '';
    const isPerishable =
      categoryName.includes('Dairy') ||
      categoryName.includes('Produce') ||
      categoryName.includes('Bakery') ||
      categoryName.includes('Meat');

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);

    const newRow: ManualDraftRow = {
      productId: prod.id,
      sku: prod.sku,
      nameEn: prod.nameEn,
      category: prod.category || 'General',
      unit: prod.isWeighed ? 'KG' : 'PCS',
      quantity: 10,
      unitCost: prod.costPrice || 0,
      batchNumber: `M-${Date.now().toString().slice(-4)}`,
      expiryDate: futureDate.toISOString().slice(0, 10),
      isPerishable,
    };

    setRows((prev) => [newRow, ...prev]);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setErrorMsg(null);
  };

  const handleCommit = () => {
    if (rows.length === 0) return;

    for (const r of rows) {
      if (r.quantity <= 0) {
        setErrorMsg(`Quantity must be greater than zero for ${r.nameEn}`);
        return;
      }
      if (r.isPerishable && (!r.expiryDate || new Date(r.expiryDate) < new Date())) {
        setErrorMsg(`Valid future expiry date is required for ${r.nameEn}`);
        return;
      }
    }

    const updated = [...existingProducts];
    let totalQty = 0;

    for (const r of rows) {
      totalQty += r.quantity;
      const idx = updated.findIndex((p) => p.id === r.productId);
      if (idx >= 0) {
        updated[idx] = {
          ...updated[idx],
          stockOnHand: updated[idx].stockOnHand + r.quantity,
          costPrice: r.unitCost,
        };
      }
    }

    onCommitSuccess(
      `Manual stock-in committed: ${rows.length} lines (${totalQty} units added to stock ledger)`,
      updated,
    );
    setRows([]);
    onClose();
  };

  const searchResults = existingProducts.filter(
    (p) =>
      p.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery),
  );

  return (
    <div
      className="modal-overlay select-none animate-in fade-in duration-100"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content max-w-4xl max-h-[92vh] flex flex-col p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30">
              <Edit3 size={20} />
            </div>
            <div>
              <h2 className="modal-title">Manual Stock Entry</h2>
              <p className="text-xs text-slate-500">
                Add multiple products by search, set batch numbers, unit costs, and expiry dates
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
          <label className="field-label mb-1">Search &amp; Add Product Line</label>
          <div className="search-bar-wrapper">
            <Search size={16} className="text-blue-600" />
            <input
              type="text"
              className="search-input"
              placeholder="Search product by name, SKU, or barcode to add..."
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
            <div className="absolute top-16 left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-h-60 overflow-y-auto p-2 flex flex-col gap-1">
              {searchResults.length === 0 ? (
                <div className="p-3 text-xs text-center text-slate-400">
                  No matching products found.
                </div>
              ) : (
                searchResults.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod)}
                    className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between text-left text-xs transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {prod.nameEn}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {prod.sku} • {prod.category}
                      </span>
                    </div>
                    <div className="text-right tabular">
                      <span className="font-bold text-blue-600">{prod.costPrice} ETB</span>
                      <span className="block text-[10px] text-slate-400">
                        On Hand: {prod.stockOnHand}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="alert-danger text-xs p-3 rounded-xl mb-3 flex items-center gap-2">
            <AlertTriangle size={15} />
            {errorMsg}
          </div>
        )}

        {/* Draft Lines Table */}
        <div className="flex-1 overflow-y-auto glass-panel border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[220px]">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
              <Edit3 size={36} className="text-slate-300 dark:text-slate-700" />
              <p className="text-sm font-semibold">No draft lines added.</p>
              <p className="text-xs max-w-sm">
                Use the search field above to select items. You can add as many lines as needed before saving.
              </p>
            </div>
          ) : (
            <table className="data-table text-xs">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th className="text-right">Unit Cost</th>
                  <th className="text-center">Quantity</th>
                  <th>Batch Number</th>
                  <th>Expiry Date</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {row.nameEn}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{row.sku}</span>
                      </div>
                    </td>
                    <td className="text-slate-500">{row.category}</td>
                    <td className="text-right tabular">
                      <input
                        type="number"
                        step="0.01"
                        className="field-input w-24 py-1 text-right text-xs"
                        value={row.unitCost}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setRows((prev) =>
                            prev.map((r, rIdx) => (rIdx === idx ? { ...r, unitCost: val } : r)),
                          );
                        }}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="number"
                        step="1"
                        className="field-input w-20 py-1 text-center font-bold text-xs"
                        value={row.quantity}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setRows((prev) =>
                            prev.map((r, rIdx) => (rIdx === idx ? { ...r, quantity: val } : r)),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="field-input w-24 py-1 text-xs"
                        value={row.batchNumber}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRows((prev) =>
                            prev.map((r, rIdx) => (rIdx === idx ? { ...r, batchNumber: val } : r)),
                          );
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={`field-input w-28 py-1 text-xs ${
                          row.isPerishable && !row.expiryDate ? 'border-red-500' : ''
                        }`}
                        value={row.expiryDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRows((prev) =>
                            prev.map((r, rIdx) => (rIdx === idx ? { ...r, expiryDate: val } : r)),
                          );
                        }}
                      />
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
          <span className="text-xs font-semibold text-slate-500">
            Total Draft: <strong>{rows.reduce((acc, r) => acc + r.quantity, 0)} units</strong> ({rows.length} lines)
          </span>

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={handleCommit}
              className="btn-primary"
            >
              <CheckCircle2 size={16} />
              Save &amp; Commit Stock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
