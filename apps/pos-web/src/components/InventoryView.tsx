import React, { useState } from 'react';
import { Package, AlertTriangle, FileEdit, CheckCircle2, Search, X } from 'lucide-react';
import { SAMPLE_PRODUCTS, SampleProduct } from '../sample-data';
import { StockAdjustmentReasonCode } from '@gebeyaos/shared-types';

export const InventoryView: React.FC = () => {
  const [products, setProducts] = useState<SampleProduct[]>(SAMPLE_PRODUCTS);
  const [search, setSearch] = useState<string>('');
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedProdId, setSelectedProdId] = useState<string>(SAMPLE_PRODUCTS[0]?.id || '');
  const [reasonCode, setReasonCode] = useState<StockAdjustmentReasonCode>('DAMAGED_GOODS');
  const [adjQuantity, setAdjQuantity] = useState<number>(-1);
  const [adjNotes, setAdjNotes] = useState<string>('Broken jar / crushed packaging during shelf stocking');

  const filtered = products.filter(
    (p) =>
      p.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
  );

  const fmt = (n: number) =>
    n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreateAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    setProducts((prev) =>
      prev.map((p) =>
        p.id === selectedProdId
          ? { ...p, stockOnHand: Math.max(0, p.stockOnHand + adjQuantity) }
          : p,
      ),
    );
    setSuccessMsg(
      `Adjustment recorded: ${reasonCode} (${adjQuantity > 0 ? `+${adjQuantity}` : adjQuantity} units)`,
    );
    setIsAdjModalOpen(false);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const lowCount = products.filter((p) => p.stockOnHand <= p.minStock).length;

  return (
    <div className="page-container">
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory &amp; Stock Ledger</h1>
          <p className="page-subtitle">
            Real-time on-hand balances, low-stock alerts, and write-offs
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setIsAdjModalOpen(true)}
        >
          <FileEdit size={15} />
          New Adjustment
        </button>
      </div>

      {/* ─── Alert banner ─── */}
      {successMsg && (
        <div className="alert-success mb-4">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* ─── Toolbar ─── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="search-bar-wrapper flex-1">
          <Search size={16} style={{ color: 'var(--primary)' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Filter by name, SKU, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {lowCount > 0 && (
          <span className="badge-danger">
            <AlertTriangle size={12} />
            {lowCount} Low Stock
          </span>
        )}
      </div>

      {/* ─── Table ─── */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU / Barcode</th>
                <th>Product Name</th>
                <th>Category</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Shelf Price</th>
                <th className="text-right">On Hand</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center py-12 text-sm"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    No items match your search.
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const isLow = p.stockOnHand <= p.minStock;
                return (
                  <tr key={p.id}>
                    <td>
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {p.sku}
                      </span>
                    </td>
                    <td className="font-semibold">{p.nameEn}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.category}</td>
                    <td className="text-right tabular" style={{ color: 'var(--text-muted)' }}>
                      {fmt(p.costPrice)} ETB
                    </td>
                    <td
                      className="text-right tabular font-semibold"
                      style={{ color: 'var(--primary)' }}
                    >
                      {fmt(p.price)} ETB
                    </td>
                    <td className="text-right tabular font-bold">
                      {p.stockOnHand} {p.isWeighed ? 'KG' : 'PCS'}
                    </td>
                    <td className="text-center">
                      {isLow ? (
                        <span className="badge-danger">
                          <AlertTriangle size={11} />
                          Low ≤{p.minStock}
                        </span>
                      ) : (
                        <span className="badge-success">
                          <Package size={11} />
                          In Stock
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Stock Adjustment Modal ─── */}
      {isAdjModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsAdjModalOpen(false)}
        >
          <div className="modal-content">
            <h2 className="modal-title">Stock Adjustment / Write-Off</h2>

            <form onSubmit={handleCreateAdjustment} className="flex flex-col gap-4">
              <div>
                <label className="field-label">Select Item</label>
                <select
                  className="field-select mt-1"
                  value={selectedProdId}
                  onChange={(e) => setSelectedProdId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nameEn} (On Hand: {p.stockOnHand})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Mandatory Reason Code</label>
                <select
                  className="field-select mt-1"
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as StockAdjustmentReasonCode)}
                >
                  <option value="DAMAGED_GOODS">DAMAGED_GOODS — Broken / Liquid Leak</option>
                  <option value="EXPIRED">EXPIRED — Past Shelf Life</option>
                  <option value="INTERNAL_USE">INTERNAL_USE — Store Cleaning / Sampling</option>
                  <option value="CORRECTION">CORRECTION — Physical Count Discrepancy</option>
                  <option value="THEFT">THEFT — Shrinkage / Stolen</option>
                </select>
              </div>

              <div>
                <label className="field-label">Quantity Change (negative = loss)</label>
                <input
                  type="number"
                  step="0.001"
                  className="field-input mt-1 text-xl font-bold"
                  value={adjQuantity}
                  onChange={(e) => setAdjQuantity(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div>
                <label className="field-label">Audit Notes / Explanation</label>
                <textarea
                  rows={2}
                  className="field-input mt-1"
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                />
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsAdjModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
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
