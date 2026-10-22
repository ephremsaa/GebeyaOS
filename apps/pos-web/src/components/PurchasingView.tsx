import React, { useState } from 'react';
import { Truck, Plus, CheckCircle2, Calculator } from 'lucide-react';
import { apportionLandedCost, calculateWithholdingTax } from '@gebeyaos/shared-types';

const SUPPLIERS = [
  {
    id: 's1',
    code: 'SUP-ALMAZ',
    name: 'Almaz Agro Industries',
    tin: '0098765432',
    phone: '+251 91 100 2233',
    terms: '30 Days',
  },
  {
    id: 's2',
    code: 'SUP-ADAA',
    name: 'Adaa Teff Farmers Union',
    tin: '0011223344',
    phone: '+251 91 123 4567',
    terms: '15 Days',
  },
  {
    id: 's3',
    code: 'SUP-TOMOCA',
    name: 'Tomoca Coffee Roasters',
    tin: '0055443322',
    phone: '+251 11 155 7788',
    terms: 'Cash on Delivery',
  },
];

type GRNRow = {
  grnNumber: string;
  supplier: string;
  date: string;
  totalCost: number;
  withholdingTax: number;
  itemsCount: number;
};

export const PurchasingView: React.FC = () => {
  const [grnList, setGrnList] = useState<GRNRow[]>([
    {
      grnNumber: 'GRN-20261021-0001',
      supplier: 'Almaz Agro Industries',
      date: '2026-10-21',
      totalCost: 11000,
      withholdingTax: 220,
      itemsCount: 1,
    },
  ]);

  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('s1');
  const [receivedQty, setReceivedQty] = useState(100);
  const [purchaseCost, setPurchaseCost] = useState(100);
  const [freightCost, setFreightCost] = useState(1000);
  const [batchNo, setBatchNo] = useState('BATCH-2026-OCT');
  const [expiryDate, setExpiryDate] = useState('2026-12-31');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const apportioned = apportionLandedCost(
    [{ productId: 'p-milk', receivedQuantity: receivedQty, purchaseUnitCost: purchaseCost }],
    freightCost,
    0,
  );
  const finalUnitCost = apportioned[0]?.finalUnitCost || purchaseCost;
  const totalCost = receivedQty * purchaseCost + freightCost;
  const withholdingTax = calculateWithholdingTax(totalCost, true);

  const fmt = (n: number) =>
    n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreateGRN = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = SUPPLIERS.find((s) => s.id === selectedSupplierId);
    const newGrn = `GRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-000${grnList.length + 1}`;
    setGrnList((prev) => [
      {
        grnNumber: newGrn,
        supplier: sup?.name || 'Supplier',
        date: new Date().toISOString().split('T')[0],
        totalCost,
        withholdingTax,
        itemsCount: 1,
      },
      ...prev,
    ]);
    setSuccessMsg(
      `GRN ${newGrn} created: ${receivedQty} units at landed unit cost ETB ${fmt(finalUnitCost)}`,
    );
    setIsGrnModalOpen(false);
    setTimeout(() => setSuccessMsg(null), 5000);
  };

  return (
    <div className="page-container">
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Purchasing &amp; Goods Receiving</h1>
          <p className="page-subtitle">
            Suppliers, purchase orders, landed cost, and AVCO cost blending
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setIsGrnModalOpen(true)}>
          <Plus size={15} />
          Receive Goods (GRN)
        </button>
      </div>

      {/* ─── Success banner ─── */}
      {successMsg && (
        <div className="alert-success mb-4">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* ─── Suppliers grid ─── */}
      <h2
        className="text-base font-bold mb-3 mt-2"
        style={{ color: 'var(--text-main)' }}
      >
        Approved Suppliers
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {SUPPLIERS.map((s) => (
          <div key={s.id} className="glass-panel p-5">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                {s.name}
              </span>
              <div className="flex flex-col items-end gap-1">
                <span className="branch-badge text-xs">{s.code}</span>
                <span className="badge-warning text-xs">WHT 2%</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div>TIN: {s.tin}</div>
              <div>📞 {s.phone}</div>
              <div>Terms: {s.terms}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── GRN Table ─── */}
      <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text-main)' }}>
        Recent Goods Received Notes (GRN)
      </h2>
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>GRN Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th className="text-right">Total Landed Cost</th>
                <th className="text-right">Withholding (2%)</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {grnList.map((g) => (
                <tr key={g.grnNumber}>
                  <td>
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                      {g.grnNumber}
                    </span>
                  </td>
                  <td className="font-semibold">{g.supplier}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{g.date}</td>
                  <td className="text-right tabular font-bold" style={{ color: 'var(--primary)' }}>
                    ETB {fmt(g.totalCost)}
                  </td>
                  <td className="text-right tabular font-semibold" style={{ color: 'var(--warning)' }}>
                    ETB {fmt(g.withholdingTax)}
                  </td>
                  <td className="text-center">
                    <span className="badge-success">
                      <Truck size={11} />
                      Received
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── GRN Modal ─── */}
      {isGrnModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setIsGrnModalOpen(false)}
        >
          <div className="modal-content" style={{ maxWidth: 560 }}>
            <h2 className="modal-title">Receive Goods Note (GRN)</h2>

            <form onSubmit={handleCreateGRN} className="flex flex-col gap-4">
              <div>
                <label className="field-label">Supplier</label>
                <select
                  className="field-select mt-1"
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                >
                  {SUPPLIERS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Received Qty</label>
                  <input
                    type="number"
                    className="field-input mt-1"
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <label className="field-label">Purchase Unit Cost (ETB)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="field-input mt-1"
                    value={purchaseCost}
                    onChange={(e) => setPurchaseCost(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Batch / Lot Number</label>
                  <input
                    type="text"
                    className="field-input mt-1"
                    value={batchNo}
                    onChange={(e) => setBatchNo(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Expiry Date</label>
                  <input
                    type="date"
                    className="field-input mt-1"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Freight / Transport Cost (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  className="field-input mt-1"
                  value={freightCost}
                  onChange={(e) => setFreightCost(parseFloat(e.target.value) || 0)}
                />
              </div>

              {/* Live cost preview */}
              <div
                className="rounded-xl p-4 flex flex-col gap-2.5 text-sm"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center gap-1.5 font-bold mb-1" style={{ color: 'var(--text-muted)' }}>
                  <Calculator size={14} />
                  Live Cost Apportionment Preview
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Apportioned Final Unit Cost</span>
                  <span className="font-bold tabular" style={{ color: 'var(--primary)' }}>
                    ETB {fmt(finalUnitCost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Total Received Bill</span>
                  <span className="font-semibold tabular">{fmt(totalCost)} ETB</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-muted)' }}>Ethiopian Withholding Tax (2%)</span>
                  <span className="font-bold tabular" style={{ color: 'var(--warning)' }}>
                    {fmt(withholdingTax)} ETB
                  </span>
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setIsGrnModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Commit &amp; Update AVCO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
