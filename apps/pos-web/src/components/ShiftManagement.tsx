import React, { useState } from 'react';
import { Clock, Banknote, ShieldAlert, FileText, CheckCircle, ArrowDownCircle } from 'lucide-react';

export const ShiftManagement: React.FC = () => {
  const [shiftOpen, setShiftOpen] = useState<boolean>(true);
  const [shiftNumber, setShiftNumber] = useState<number>(1);
  const [openingFloat, setOpeningFloat] = useState<number>(1000);
  const [cashDrops, setCashDrops] = useState<Array<{ time: string; amount: number; reason: string }>>([
    { time: '12:30 PM', amount: 3000, reason: 'Midday safe drop' },
  ]);

  // Drop modal state
  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);
  const [dropAmount, setDropAmount] = useState<number>(1000);
  const [dropReason, setDropReason] = useState<string>('Excess cash to back office safe');

  // Close shift modal state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [zReportData, setZReportData] = useState<any | null>(null);

  // Simulated live readings for X-report
  const grossSales = 12500;
  const cashSales = 7500;
  const telebirrSales = 3500;
  const cardSales = 1500;
  const totalDrops = cashDrops.reduce((sum, d) => sum + d.amount, 0);
  const expectedCashInDrawer = openingFloat + cashSales - totalDrops;

  const handleOpenShift = () => {
    setShiftOpen(true);
    setShiftNumber((prev) => prev + 1);
    setZReportData(null);
  };

  const handleRecordDrop = () => {
    if (dropAmount <= 0) return;
    setCashDrops((prev) => [
      ...prev,
      {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        amount: dropAmount,
        reason: dropReason,
      },
    ]);
    setIsDropModalOpen(false);
  };

  const handleCloseShift = () => {
    const variance = Math.round((countedCash - expectedCashInDrawer + Number.EPSILON) * 100) / 100;
    setZReportData({
      shiftNumber,
      closedAt: new Date().toLocaleTimeString(),
      openingFloat,
      cashSales,
      telebirrSales,
      cardSales,
      totalDrops,
      expectedCash: expectedCashInDrawer,
      countedCash,
      variance,
    });
    setShiftOpen(false);
    setIsCloseModalOpen(false);
  };

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Cashier Shift Management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Terminal: POS-01 • Cashier: Abebe Bikila</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className={`branch-badge`} style={{ borderColor: shiftOpen ? '#10b981' : '#ef4444', color: shiftOpen ? '#34d399' : '#f87171' }}>
            <Clock size={14} /> Shift #{shiftNumber}: {shiftOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
      </div>

      {shiftOpen ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Active Drawer Reading (Interim X-Report) */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <FileText size={20} color="var(--primary)" />
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Interim Shift Reading (X-Report)</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Opening Cash Float:</span>
                <span style={{ color: '#ffffff', fontWeight: 600 }}>{openingFloat.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Gross Sales:</span>
                <span style={{ color: '#ffffff', fontWeight: 600 }}>{grossSales.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>  • Cash Sales Tendered:</span>
                <span style={{ color: '#34d399', fontWeight: 600 }}>+{cashSales.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>  • Telebirr Sales:</span>
                <span>{telebirrSales.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>  • Card POS Sales:</span>
                <span>{cardSales.toFixed(2)} ETB</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Safe Drops Recorded:</span>
                <span style={{ color: '#f87171', fontWeight: 600 }}>-{totalDrops.toFixed(2)} ETB</span>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 800 }}>
                <span>Expected Cash in Drawer:</span>
                <span style={{ color: '#34d399' }}>{expectedCashInDrawer.toFixed(2)} ETB</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
              <button
                type="button"
                className="chip-btn active"
                onClick={() => setIsDropModalOpen(true)}
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <ArrowDownCircle size={16} /> Safe Drop
              </button>
              <button
                type="button"
                className="chip-btn"
                onClick={() => { setCountedCash(expectedCashInDrawer); setIsCloseModalOpen(true); }}
                style={{ flex: 1, padding: '12px', background: 'rgba(239, 68, 68, 0.15)', borderColor: '#ef4444', color: '#f87171' }}
              >
                Blind Close Shift
              </button>
            </div>
          </div>

          {/* Cash Drops History */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Shift Cash Drops</h2>
            {cashDrops.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', textAlign: 'center', margin: '40px 0' }}>No safe drops recorded yet this shift</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cashDrops.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-elevated)', padding: '10px 14px', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{d.reason}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.time}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: '#f87171' }}>-{d.amount.toFixed(2)} ETB</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Shift Closed View / Open Shift Form */
        <div style={{ maxWidth: '520px', margin: '40px auto' }}>
          {zReportData && (
            <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px', borderLeft: '4px solid #10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '12px' }}>
                <CheckCircle size={22} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Shift #{zReportData.shiftNumber} Z-Report Generated</h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>Shift successfully closed at {zReportData.closedAt}.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Expected System Cash:</span>
                  <span style={{ fontWeight: 600 }}>{zReportData.expectedCash.toFixed(2)} ETB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Counted Cash:</span>
                  <span style={{ fontWeight: 600 }}>{zReportData.countedCash.toFixed(2)} ETB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: zReportData.variance >= 0 ? '#34d399' : '#f87171' }}>
                  <span>Variance (Over/Short):</span>
                  <span>{zReportData.variance.toFixed(2)} ETB</span>
                </div>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Open New Cashier Shift</h2>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Initial Drawer Cash Float (ETB)</label>
            <input
              type="number"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', fontSize: '1.1rem', margin: '8px 0 16px' }}
            />
            <button type="button" className="pay-btn" onClick={handleOpenShift}>
              Open Shift #{shiftNumber + 1}
            </button>
          </div>
        </div>
      )}

      {/* Cash Drop Modal */}
      {isDropModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px' }}>Record Mid-Shift Safe Drop</h2>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Amount to Transfer to Safe (ETB)</label>
            <input
              type="number"
              value={dropAmount}
              onChange={(e) => setDropAmount(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', margin: '8px 0 14px' }}
            />
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Drop Reason</label>
            <input
              type="text"
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', borderRadius: '8px', margin: '8px 0 16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="chip-btn" onClick={() => setIsDropModalOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancel</button>
              <button type="button" className="pay-btn" onClick={handleRecordDrop} style={{ flex: 1, marginTop: 0 }}>Confirm Drop</button>
            </div>
          </div>
        </div>
      )}

      {/* Blind Close Shift Modal */}
      {isCloseModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content glass-panel">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '12px' }}>Blind Close Cashier Shift</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Enter the total physical cash counted in the drawer. The system will audit the discrepancy against sales.
            </p>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Physical Counted Cash (ETB)</label>
            <input
              type="number"
              value={countedCash}
              onChange={(e) => setCountedCash(parseFloat(e.target.value) || 0)}
              style={{ width: '100%', padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: '#ffffff', fontSize: '1.2rem', fontWeight: 700, borderRadius: '8px', margin: '8px 0 16px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="chip-btn" onClick={() => setIsCloseModalOpen(false)} style={{ flex: 1, padding: '10px' }}>Cancel</button>
              <button type="button" className="pay-btn" onClick={handleCloseShift} style={{ flex: 1, marginTop: 0, background: '#ef4444' }}>Submit Z-Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
