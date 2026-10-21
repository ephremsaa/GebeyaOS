import React, { useState } from 'react';
import { Truck, Plus, CheckCircle2, DollarSign, Calculator } from 'lucide-react';
import { calculateAVCO, apportionLandedCost, calculateWithholdingTax } from '@gebeyaos/shared-types';

export const PurchasingView: React.FC = () => {
  const [suppliers] = useState([
    { id: 's1', code: 'SUP-ALMAZ', name: 'Almaz Agro Industries', tin: '0098765432', phone: '+251 91 100 2233', terms: '30 Days' },
    { id: 's2', code: 'SUP-ADAA', name: 'Adaa Teff Farmers Union', tin: '0011223344', phone: '+251 91 123 4567', terms: '15 Days' },
    { id: 's3', code: 'SUP-TOMOCA', name: 'Tomoca Coffee Roasters', tin: '0055443322', phone: '+251 11 155 7788', terms: 'Cash on Delivery' },
  ]);

  const [grnList, setGrnList] = useState([
    {
      grnNumber: 'GRN-20261021-0001',
      supplier: 'Almaz Agro Industries',
      date: '2026-10-21',
      totalCost: 11000,
      withholdingTax: 220, // 2%
      itemsCount: 1,
    },
  ]);

  // New GRN modal state
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('s1');
  const [receivedQty, setReceivedQty] = useState(100);
  const [purchaseCost, setPurchaseCost] = useState(100);
  const [freightCost, setFreightCost] = useState(1000);
  const [batchNo, setBatchNo] = useState('BATCH-2026-OCT');
  const [expiryDate, setExpiryDate] = useState('2026-12-31');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live calculation preview
  const apportioned = apportionLandedCost(
    [{ productId: 'p-milk', receivedQuantity: receivedQty, purchaseUnitCost: purchaseCost }],
    freightCost,
    0,
  );
  const finalUnitCost = apportioned[0]?.finalUnitCost || purchaseCost;
  const totalCost = receivedQty * purchaseCost + freightCost;
  const withholdingTax = calculateWithholdingTax(totalCost, true);

  const handleCreateGRN = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const newGrnNumber = `GRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-000${grnList.length + 1}`;

    setGrnList((prev) => [
      {
        grnNumber: newGrnNumber,
        supplier: sup?.name || 'Supplier',
        date: new Date().toISOString().split('T')[0],
        totalCost,
        withholdingTax,
        itemsCount: 1,
      },
      ...prev,
    ]);

    setSuccessMsg(`GRN ${newGrnNumber} created: Received ${receivedQty} units at landed unit cost of ${finalUnitCost.toFixed(2)} ETB`);
    setIsGrnModalOpen(false);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Purchasing & Goods Receiving (GRN)</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Suppliers, purchase orders, landed cost distribution, and AVCO cost blending</p>
        </div>
        <button
          type="button"
          className="chip-btn active"
          onClick={() => setIsGrnModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontWeight: 600 }}
        >
          <Plus size={16} /> Receive Goods (New GRN)
        </button>
      </div>

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {/* Suppliers Overview */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '20px 0 12px' }}>Approved Suppliers</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {suppliers.map((s) => (
          <div key={s.id} className="glass-panel" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.name}</div>
              <span className="branch-badge" style={{ fontSize: '0.65rem' }}>{s.code}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div>TIN: {s.tin} (Withholding 2% Eligible)</div>
              <div>Phone: {s.phone}</div>
              <div>Terms: {s.terms}</div>
            </div>
          </div>
        ))}
      </div>

      {/* GRN Recent History */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px' }}>Recent Goods Received Notes (GRN)</h2>
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 16px' }}>GRN Number</th>
              <th style={{ padding: '12px 16px' }}>Supplier</th>
              <th style={{ padding: '12px 16px' }}>Date</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Landed Cost</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Withholding Tax (2%)</th>
              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {grnList.map((g) => (
              <tr key={g.grnNumber} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{g.grnNumber}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{g.supplier}</td>
                <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{g.date}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{g.totalCost.toFixed(2)} ETB</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{g.withholdingTax.toFixed(2)} ETB</td>
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <span style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#34d399', padding: '2px 8px', borderRadius: '12px', fontSize: '0.725rem', fontWeight: 600 }}>
                    Received
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Receive Goods GRN Modal */}
      {isGrnModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ width: '520px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '16px' }}>Receive Goods Note (GRN)</h2>
            <form onSubmit={handleCreateGRN} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Supplier</label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Received Qty</label>
                  <input
                    type="number"
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Purchase Unit Cost (ETB)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(parseFloat(e.target.value) || 0)}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Batch / Lot Number</label>
                  <input
                    type="text"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Landed Freight / Transport Cost (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  value={freightCost}
                  onChange={(e) => setFreightCost(parseFloat(e.target.value) || 0)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', marginTop: '6px' }}
                />
              </div>

              {/* Live Cost Apportionment Preview Box */}
              <div style={{ background: 'var(--bg-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Apportioned Final Unit Cost:</span>
                  <span style={{ color: '#34d399', fontWeight: 700 }}>{finalUnitCost.toFixed(2)} ETB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Total Received Bill:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{totalCost.toFixed(2)} ETB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                  <span>Ethiopian Withholding Tax (2%):</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700 }}>{withholdingTax.toFixed(2)} ETB</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="chip-btn" onClick={() => setIsGrnModalOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancel</button>
                <button type="submit" className="pay-btn" style={{ flex: 1, marginTop: 0 }}>Commit & Update AVCO</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
