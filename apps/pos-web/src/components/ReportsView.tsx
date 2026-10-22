import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  AlertTriangle,
  Layers,
  PieChart,
  Download,
} from 'lucide-react';

type Period = 'today' | 'yesterday' | 'week';

const EXPIRING_BATCHES = [
  {
    id: 'b-01',
    sku: 'MILK-ANCHOR-1L',
    name: 'Anchor UHT Whole Milk 1L',
    batchNo: 'B-2026-ANCHOR-09',
    expiryDate: '2026-11-05',
    daysLeft: 15,
    qty: 24,
    status: 'WARNING' as const,
  },
  {
    id: 'b-02',
    sku: 'YOGURT-MAMA-500G',
    name: 'Mama Strawberry Fresh Yogurt 500g',
    batchNo: 'B-2026-MAMA-12',
    expiryDate: '2026-11-12',
    daysLeft: 22,
    qty: 18,
    status: 'WARNING' as const,
  },
  {
    id: 'b-03',
    sku: 'BEEF-TENDERLOIN-KG',
    name: 'Fresh Beef Tenderloin (Scale)',
    batchNo: 'B-2026-BEEF-04',
    expiryDate: '2026-10-24',
    daysLeft: 3,
    qty: 8.5,
    status: 'CRITICAL' as const,
  },
  {
    id: 'b-04',
    sku: 'BUTTER-SHENKOR-500G',
    name: 'Sheno Traditional Butter 500g',
    batchNo: 'B-2026-SHENO-01',
    expiryDate: '2026-11-28',
    daysLeft: 38,
    qty: 30,
    status: 'GOOD' as const,
  },
];

const CATEGORY_VALUATION = [
  { category: 'Bakery & Grains', value: 34500, units: 146, share: 32 },
  { category: 'Dairy & Eggs', value: 24200, units: 210, share: 22 },
  { category: 'Meat & Butchery', value: 17290, units: 18.2, share: 16 },
  { category: 'Beverages', value: 15450, units: 145, share: 14 },
  { category: 'Household', value: 10800, units: 60, share: 10 },
  { category: 'Fresh Produce', value: 6500, units: 45.5, share: 6 },
];

const PAYMENT_TENDER = [
  { label: 'Cash (Birr Notes)', pct: 52, color: '#059669' },
  { label: 'Telebirr (USSD / QR)', pct: 31, color: '#2563eb' },
  { label: 'CBE Birr', pct: 12, color: '#d97706' },
  { label: 'Debit Card / POS Terminal', pct: 5, color: '#7c3aed' },
];

export const ReportsView: React.FC = () => {
  const [period, setPeriod] = useState<Period>('today');

  const grossSales =
    period === 'today' ? 48650.0 : period === 'yesterday' ? 62400.0 : 345800.0;
  const vatCollected =
    period === 'today' ? 4425.0 : period === 'yesterday' ? 5670.0 : 31440.0;
  const netSales = grossSales - vatCollected;
  const cogs = grossSales * 0.72;
  const grossProfit = grossSales - cogs;
  const marginPct = ((grossProfit / grossSales) * 100).toFixed(1);
  const txCount = period === 'today' ? 142 : period === 'yesterday' ? 186 : 1048;
  const avgBasket = (grossSales / txCount).toFixed(2);

  const fmt = (n: number) =>
    n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'week', label: 'This Week' },
  ];

  const batchBadge = (status: 'CRITICAL' | 'WARNING' | 'GOOD') => {
    if (status === 'CRITICAL') return <span className="badge-danger">CRITICAL</span>;
    if (status === 'WARNING') return <span className="badge-warning">WARNING</span>;
    return <span className="badge-success">GOOD</span>;
  };

  return (
    <div className="page-container flex flex-col gap-6">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <TrendingUp size={22} style={{ color: 'var(--primary)' }} />
            Store Financial &amp; Operational Reports
          </h1>
          <p className="page-subtitle">
            Bole Medhanialem Branch (BR-ADDIS-01) — Z-Report &amp; Tax Audits
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period segmented control */}
          <div className="seg-ctrl">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                className={`seg-ctrl-btn ${period === key ? 'active' : ''}`}
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            className="btn-secondary"
            onClick={() => alert('Exporting Official Ethiopian Ministry of Revenue Sales Audit (CSV/PDF)…')}
          >
            <Download size={15} />
            Export Audit
          </button>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Gross Revenue <DollarSign size={15} style={{ color: 'var(--primary)' }} />
          </div>
          <div className="kpi-value tabular" style={{ color: 'var(--primary)' }}>
            {fmt(grossSales)}
          </div>
          <div className="kpi-sub">ETB incl. VAT</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            15% VAT Collected <Receipt size={15} style={{ color: 'var(--warning)' }} />
          </div>
          <div className="kpi-value tabular" style={{ color: 'var(--warning)' }}>
            {fmt(vatCollected)}
          </div>
          <div className="kpi-sub">Net: ETB {fmt(netSales)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Gross Profit <TrendingUp size={15} style={{ color: 'var(--info)' }} />
          </div>
          <div className="kpi-value tabular" style={{ color: 'var(--info)' }}>
            {fmt(grossProfit)}
          </div>
          <div className="kpi-sub font-semibold" style={{ color: 'var(--primary)' }}>
            {marginPct}% gross margin
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Transactions <PieChart size={15} style={{ color: '#7c3aed' }} />
          </div>
          <div className="kpi-value tabular" style={{ color: '#7c3aed' }}>
            {txCount}
          </div>
          <div className="kpi-sub">Avg basket: ETB {avgBasket}</div>
        </div>
      </div>

      {/* ─── Two-column: Tender split + Category valuation ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Payment Tender Distribution */}
        <div className="glass-panel p-5">
          <h3
            className="font-bold text-base mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-main)' }}
          >
            <PieChart size={16} style={{ color: 'var(--primary)' }} />
            Payment Tender Distribution
          </h3>

          <div className="flex flex-col gap-4">
            {PAYMENT_TENDER.map((t) => (
              <div key={t.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-semibold" style={{ color: t.color }}>
                    {t.label}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {t.pct}% · ETB {fmt(grossSales * (t.pct / 100))}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${t.pct}%`, background: t.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Category Stock Valuation */}
        <div className="glass-panel p-5">
          <h3
            className="font-bold text-base mb-4 flex items-center gap-2"
            style={{ color: 'var(--text-main)' }}
          >
            <Layers size={16} style={{ color: 'var(--warning)' }} />
            Category Stock Valuation (AVCO)
          </h3>

          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Units</th>
                  <th className="text-right">Value (ETB)</th>
                  <th className="text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_VALUATION.map((c) => (
                  <tr key={c.category}>
                    <td className="font-medium">{c.category}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.units}</td>
                    <td className="text-right tabular font-semibold">
                      {c.value.toLocaleString()}
                    </td>
                    <td className="text-right">
                      <span className="badge-neutral">{c.share}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── FEFO Expiring Batches ─── */}
      <div className="glass-panel p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3
              className="font-bold text-base flex items-center gap-2"
              style={{ color: 'var(--text-main)' }}
            >
              <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
              Expiring Batches &amp; FEFO Rotation Alert
            </h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              First-Expiring, First-Out alerts for perishables and dairy stock
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Batch No</th>
                <th>Expiry Date</th>
                <th className="text-center">Days Left</th>
                <th className="text-center">Units on Hand</th>
                <th className="text-center">FEFO Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {EXPIRING_BATCHES.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="font-semibold">{b.name}</div>
                    <div
                      className="text-xs font-mono mt-0.5"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      {b.sku}
                    </div>
                  </td>
                  <td className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                    {b.batchNo}
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>{b.expiryDate}</td>
                  <td className="text-center">
                    <span
                      className="font-bold tabular"
                      style={{
                        color:
                          b.daysLeft <= 7
                            ? 'var(--danger)'
                            : b.daysLeft <= 25
                            ? 'var(--warning)'
                            : 'var(--primary)',
                      }}
                    >
                      {b.daysLeft}d
                    </span>
                  </td>
                  <td className="text-center font-semibold">{b.qty} units</td>
                  <td className="text-center">{batchBadge(b.status)}</td>
                  <td className="text-right">
                    <button
                      className="btn-secondary text-xs"
                      style={{ minHeight: 32, padding: '0 12px', fontSize: '0.75rem' }}
                      onClick={() =>
                        alert(`Discount promo applied for batch ${b.batchNo}.`)
                      }
                    >
                      Clearance Promo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
