import React, { useState } from 'react';
import { Package, AlertTriangle, Plus, Search, FileEdit, CheckCircle2 } from 'lucide-react';
import { SAMPLE_PRODUCTS, SampleProduct } from '../sample-data';
import { StockAdjustmentReasonCode } from '@gebeyaos/shared-types';

export const InventoryView: React.FC = () => {
  const [products, setProducts] = useState<SampleProduct[]>(SAMPLE_PRODUCTS);
  const [search, setSearch] = useState<string>('');
  const [isAdjModalOpen, setIsAdjModalOpen] = useState<boolean>(false);

  // Adjustment form state
  const [selectedProdId, setSelectedProdId] = useState<string>(SAMPLE_PRODUCTS[0]?.id || '');
  const [reasonCode, setReasonCode] = useState<StockAdjustmentReasonCode>('DAMAGED_GOODS');
  const [adjQuantity, setAdjQuantity] = useState<number>(-1);
  const [adjNotes, setAdjNotes] = useState<string>('Broken jar / crushed packaging during shelf stocking');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const filtered = products.filter(
    (p) =>
      p.nameEn.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreateAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === selectedProdId) {
          return {
            ...p,
            stockOnHand: Math.max(0, p.stockOnHand + adjQuantity),
          };
        }
        return p;
      }),
    );
    setSuccessMsg(`Adjustment recorded: ${reasonCode} (${adjQuantity > 0 ? `+${adjQuantity}` : adjQuantity} units)`);
    setIsAdjModalOpen(false);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Inventory & Stock Ledger</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Real-time on-hand balances, low stock alerts, and write-offs</p>
        </div>
        <button
          type="button"
          className="chip-btn active"
          onClick={() => setIsAdjModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontWeight: 600 }}
        >
          <FileEdit size={16} /> New Stock Adjustment
        </button>
      </div>

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {/* Search Bar */}
      <div className="search-bar-wrapper" style={{ marginBottom: '16px' }}>
        <Search size={20} color="var(--primary)" />
        <input
          type="text"
          className="search-input"
          placeholder="Filter stock by product name, SKU, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stock Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 16px' }}>SKU / Barcode</th>
              <th style={{ padding: '12px 16px' }}>Product Name</th>
              <th style={{ padding: '12px 16px' }}>Category</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Unit Cost</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Shelf Price</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>On Hand</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const isLow = p.stockOnHand <= p.minStock;
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{p.sku}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.nameEn}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{p.category}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>{p.costPrice.toFixed(2)} ETB</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: '#34d399' }}>{p.price.toFixed(2)} ETB</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                    {p.stockOnHand} {p.isWeighed ? 'KG' : 'PCS'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {isLow ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid #ef4444', padding: '2px 8px', borderRadius: '12px', fontSize: '0.725rem', fontWeight: 600 }}>
                        <AlertTriangle size={12} /> Low Stock (&le;{p.minStock})
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', padding: '2px 8px', borderRadius: '12px', fontSize: '0.725rem', fontWeight: 600 }}>
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

      {/* Stock Adjustment Modal */}
      {isAdjModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px' }}>Stock Adjustment / Write-Off</h2>
            <form onSubmit={handleCreateAdjustment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Select Item</label>
                <select
                  value={selectedProdId}
                  onChange={(e) => setSelectedProdId(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.nameEn} (Current: {p.stockOnHand})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Mandatory Reason Code</label>
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value as StockAdjustmentReasonCode)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                >
                  <option value="DAMAGED_GOODS">DAMAGED_GOODS (Broken/Crushed/Liquid Leak)</option>
                  <option value="EXPIRED">EXPIRED (Past Shelf Life)</option>
                  <option value="INTERNAL_USE">INTERNAL_USE (Store Cleaning/Sampling)</option>
                  <option value="CORRECTION">CORRECTION (Physical Count Discrepancy)</option>
                  <option value="THEFT">THEFT (Shrinkage / Stolen)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Quantity Change (Negative for Loss)</label>
                <input
                  type="number"
                  step="0.001"
                  value={adjQuantity}
                  onChange={(e) => setAdjQuantity(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Audit Notes / Explanation</label>
                <textarea
                  rows={2}
                  value={adjNotes}
                  onChange={(e) => setAdjNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="chip-btn" onClick={() => setIsAdjModalOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancel</button>
                <button type="submit" className="pay-btn" style={{ flex: 1, marginTop: 0 }}>Commit Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
