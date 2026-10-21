import React, { useState } from 'react';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  AlertTriangle,
  Layers,
  PieChart,
  Calendar,
  Download,
  Filter,
} from 'lucide-react';
import { SAMPLE_PRODUCTS } from '../sample-data';

export const ReportsView: React.FC = () => {
  const [period, setPeriod] = useState<'today' | 'yesterday' | 'week'>('today');

  // Ethiopian Supermarket Sales Metrics
  const grossSales = period === 'today' ? 48650.0 : period === 'yesterday' ? 62400.0 : 345800.0;
  const vatCollected = period === 'today' ? 4425.0 : period === 'yesterday' ? 5670.0 : 31440.0;
  const netSales = grossSales - vatCollected;
  const cogs = grossSales * 0.72; // ~72% COGS
  const grossProfit = grossSales - cogs;
  const marginPct = ((grossProfit / grossSales) * 100).toFixed(1);
  const txCount = period === 'today' ? 142 : period === 'yesterday' ? 186 : 1048;
  const avgBasket = (grossSales / txCount).toFixed(2);

  // Expiring Batches for FEFO warning (Ethiopian staples & perishables)
  const expiringBatches = [
    {
      id: 'b-01',
      sku: 'MILK-ANCHOR-1L',
      name: 'Anchor UHT Whole Milk 1L',
      batchNo: 'B-2026-ANCHOR-09',
      expiryDate: '2026-11-05',
      daysLeft: 15,
      qty: 24,
      status: 'CRITICAL',
    },
    {
      id: 'b-02',
      sku: 'YOGURT-MAMA-500G',
      name: 'Mama Strawberry Fresh Yogurt 500g',
      batchNo: 'B-2026-MAMA-12',
      expiryDate: '2026-11-12',
      daysLeft: 22,
      qty: 18,
      status: 'WARNING',
    },
    {
      id: 'b-03',
      sku: 'BEEF-TENDERLOIN-KG',
      name: 'Fresh Beef Tenderloin (Scale)',
      batchNo: 'B-2026-BEEF-04',
      expiryDate: '2026-10-24',
      daysLeft: 3,
      qty: 8.5,
      status: 'CRITICAL',
    },
    {
      id: 'b-04',
      sku: 'BUTTER-SHENKOR-500G',
      name: 'Sheno Traditional Butter 500g',
      batchNo: 'B-2026-SHENO-01',
      expiryDate: '2026-11-28',
      daysLeft: 38,
      qty: 30,
      status: 'GOOD',
    },
  ];

  // Category valuation based on SAMPLE_PRODUCTS
  const categoryValuation = [
    { category: 'Bakery & Grains', value: 34500, units: 146, share: '32%' },
    { category: 'Dairy & Eggs', value: 24200, units: 210, share: '22%' },
    { category: 'Meat & Butchery', value: 17290, units: 18.2, share: '16%' },
    { category: 'Beverages', value: 15450, units: 145, share: '14%' },
    { category: 'Household', value: 10800, units: 60, share: '10%' },
    { category: 'Fresh Produce', value: 6500, units: 45.5, share: '6%' },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', overflowY: 'auto' }}>
      {/* Header with period controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrendingUp size={24} color="var(--primary)" />
            Store Financial & Operational Reports
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Bole Medhanialem Branch (BR-ADDIS-01) — Automated Z-Report & Tax Audits
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setPeriod('today')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                background: period === 'today' ? 'var(--primary)' : 'transparent',
                color: period === 'today' ? '#000' : 'var(--text-muted)',
                fontWeight: period === 'today' ? 700 : 500,
                fontSize: '0.825rem',
              }}
            >
              Today
            </button>
            <button
              onClick={() => setPeriod('yesterday')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                background: period === 'yesterday' ? 'var(--primary)' : 'transparent',
                color: period === 'yesterday' ? '#000' : 'var(--text-muted)',
                fontWeight: period === 'yesterday' ? 700 : 500,
                fontSize: '0.825rem',
              }}
            >
              Yesterday
            </button>
            <button
              onClick={() => setPeriod('week')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                background: period === 'week' ? 'var(--primary)' : 'transparent',
                color: period === 'week' ? '#000' : 'var(--text-muted)',
                fontWeight: period === 'week' ? 700 : 500,
                fontSize: '0.825rem',
              }}
            >
              This Week
            </button>
          </div>

          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
            onClick={() => alert('Exporting Official Ethiopian Ministry of Revenue Sales Audit (CSV/PDF)...')}
          >
            <Download size={16} />
            Export Audit
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        {/* Gross Sales */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Gross Revenue</span>
            <DollarSign size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '10px', color: '#10b981' }}>
            ETB {grossSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Tax Inclusive Retail Revenue
          </div>
        </div>

        {/* 15% VAT Collected */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>15% VAT Collected</span>
            <Receipt size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '10px', color: 'var(--accent-gold)' }}>
            ETB {vatCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Net: ETB {netSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        {/* Gross Margin & Profit */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Gross Profit (Margin)</span>
            <TrendingUp size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '10px', color: '#60a5fa' }}>
            ETB {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '4px', fontWeight: 600 }}>
            {marginPct}% Gross Margin Rate
          </div>
        </div>

        {/* Transactions & Avg Basket */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Transactions & Basket</span>
            <PieChart size={18} color="#a855f7" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '10px', color: '#c084fc' }}>
            {txCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>txns</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Avg Basket: ETB {avgBasket}
          </div>
        </div>
      </div>

      {/* Two Column Section: Payment Tender Split & Category Stock Valuation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Payment Methods */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PieChart size={18} color="var(--primary)" />
            Payment Tender Distribution
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600 }}>Cash (Birr Notes)</span>
                <span>52% (ETB {(grossSales * 0.52).toFixed(2)})</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '52%', height: '100%', background: '#10b981' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>Telebirr (USSD / QR)</span>
                <span>31% (ETB {(grossSales * 0.31).toFixed(2)})</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '31%', height: '100%', background: '#0284c7' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: '#f59e0b' }}>CBE Birr</span>
                <span>12% (ETB {(grossSales * 0.12).toFixed(2)})</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '12%', height: '100%', background: '#d97706' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 600, color: '#a855f7' }}>Debit Card / POS Terminal</span>
                <span>5% (ETB {(grossSales * 0.05).toFixed(2)})</span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: '5%', height: '100%', background: '#9333ea' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Category Valuation */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={18} color="var(--accent-gold)" />
            Category Stock Valuation (AVCO)
          </h3>

          <div style={{ overflowX: 'auto' }}>
            <table className="pos-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Category</th>
                  <th style={{ padding: '8px' }}>Units</th>
                  <th style={{ padding: '8px' }}>Value (ETB)</th>
                  <th style={{ padding: '8px' }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {categoryValuation.map((c) => (
                  <tr key={c.category} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '8px', fontWeight: 500 }}>{c.category}</td>
                    <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{c.units}</td>
                    <td style={{ padding: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      ETB {c.value.toLocaleString()}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                        {c.share}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FEFO & Expiring Batches Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} color="var(--accent-gold)" />
              Expiring Batches & FEFO Rotation Alert
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '2px' }}>
              First-Expiring, First-Out alerts for perishables and dairy stock
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Product</th>
                <th style={{ padding: '10px' }}>Batch No</th>
                <th style={{ padding: '10px' }}>Expiry Date</th>
                <th style={{ padding: '10px' }}>Days Remaining</th>
                <th style={{ padding: '10px' }}>Units on Hand</th>
                <th style={{ padding: '10px' }}>FEFO Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {expiringBatches.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{b.sku}</div>
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{b.batchNo}</td>
                  <td style={{ padding: '10px' }}>{b.expiryDate}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ fontWeight: 700, color: b.daysLeft <= 7 ? '#ef4444' : b.daysLeft <= 25 ? '#f59e0b' : '#10b981' }}>
                      {b.daysLeft} days
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontWeight: 600 }}>{b.qty} units</td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background:
                          b.status === 'CRITICAL'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : b.status === 'WARNING'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                        color:
                          b.status === 'CRITICAL'
                            ? '#f87171'
                            : b.status === 'WARNING'
                            ? '#fbbf24'
                            : '#34d399',
                        border: `1px solid ${
                          b.status === 'CRITICAL'
                            ? 'rgba(239, 68, 68, 0.3)'
                            : b.status === 'WARNING'
                            ? 'rgba(245, 158, 11, 0.3)'
                            : 'rgba(16, 185, 129, 0.3)'
                        }`,
                      }}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button
                      onClick={() => alert(`Discount promo applied for batch ${b.batchNo} to clear before expiry.`)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                      }}
                    >
                      Apply Clearance Promo
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
