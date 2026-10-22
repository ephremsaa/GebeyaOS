import React, { useState } from 'react';
import { Clock, FileText, ArrowDownCircle, CheckCircle, AlertCircle } from 'lucide-react';

export const ShiftManagement: React.FC = () => {
  const [shiftOpen, setShiftOpen] = useState<boolean>(true);
  const [shiftNumber, setShiftNumber] = useState<number>(1);
  const [openingFloat, setOpeningFloat] = useState<number>(1000);
  const [cashDrops, setCashDrops] = useState<Array<{ time: string; amount: number; reason: string }>>([
    { time: '12:30 PM', amount: 3000, reason: 'Midday safe drop' },
  ]);

  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);
  const [dropAmount, setDropAmount] = useState<number>(1000);
  const [dropReason, setDropReason] = useState<string>('Excess cash to back office safe');

  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [countedCash, setCountedCash] = useState<number>(0);
  const [zReportData, setZReportData] = useState<any | null>(null);

  const grossSales = 12500;
  const cashSales = 7500;
  const telebirrSales = 3500;
  const cardSales = 1500;
  const totalDrops = cashDrops.reduce((sum, d) => sum + d.amount, 0);
  const expectedCashInDrawer = openingFloat + cashSales - totalDrops;

  const fmt = (n: number) =>
    n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    const variance =
      Math.round((countedCash - expectedCashInDrawer + Number.EPSILON) * 100) / 100;
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

  /* ─── Row helper ─── */
  const Row = ({
    label,
    value,
    valueClass,
  }: {
    label: string;
    value: string;
    valueClass?: string;
  }) => (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className={`text-sm font-semibold tabular ${valueClass ?? ''}`}>{value}</span>
    </div>
  );

  return (
    <div className="page-container">
      {/* ─── Header ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cashier Shift</h1>
          <p className="page-subtitle">Terminal POS-01 · Cashier: Bethlehem T.</p>
        </div>
        <span
          className="branch-badge"
          style={
            shiftOpen
              ? {}
              : { color: 'var(--danger)', borderColor: 'rgba(220,38,38,.3)', background: 'rgba(220,38,38,.08)' }
          }
        >
          <Clock size={13} />
          Shift #{shiftNumber}: {shiftOpen ? 'OPEN' : 'CLOSED'}
        </span>
      </div>

      {shiftOpen ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ─── X-Report Card ─── */}
          <div className="glass-panel p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-5">
              <FileText size={18} style={{ color: 'var(--primary)' }} />
              <h2 className="font-bold text-base" style={{ color: 'var(--text-main)' }}>
                Interim Shift Reading (X-Report)
              </h2>
            </div>

            <div
              className="divide-y flex-1"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <Row label="Opening Cash Float" value={`ETB ${fmt(openingFloat)}`} />
              <Row label="Gross Sales" value={`ETB ${fmt(grossSales)}`} />
              <Row
                label="  • Cash Sales"
                value={`+ ETB ${fmt(cashSales)}`}
                valueClass="text-emerald-600 dark:text-emerald-400"
              />
              <Row label="  • Telebirr Sales" value={`ETB ${fmt(telebirrSales)}`} />
              <Row label="  • Card POS Sales" value={`ETB ${fmt(cardSales)}`} />
              <Row
                label="Safe Drops Recorded"
                value={`− ETB ${fmt(totalDrops)}`}
                valueClass="text-red-600 dark:text-red-400"
              />
            </div>

            <div
              className="flex justify-between items-center pt-4 mt-2 border-t font-bold"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <span className="text-sm" style={{ color: 'var(--text-main)' }}>
                Expected Cash in Drawer
              </span>
              <span
                className="text-lg tabular"
                style={{ color: 'var(--primary)' }}
              >
                ETB {fmt(expectedCashInDrawer)}
              </span>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => setIsDropModalOpen(true)}
              >
                <ArrowDownCircle size={16} />
                Safe Drop
              </button>
              <button
                type="button"
                className="btn-danger flex-1"
                onClick={() => {
                  setCountedCash(expectedCashInDrawer);
                  setIsCloseModalOpen(true);
                }}
              >
                Close Shift
              </button>
            </div>
          </div>

          {/* ─── Cash Drops History ─── */}
          <div className="glass-panel p-6">
            <h2 className="font-bold text-base mb-4" style={{ color: 'var(--text-main)' }}>
              Shift Cash Drops
            </h2>

            {cashDrops.length === 0 ? (
              <div
                className="text-sm text-center py-12"
                style={{ color: 'var(--text-dim)' }}
              >
                No safe drops recorded this shift.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {cashDrops.map((d, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center px-4 py-3 rounded-lg"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                        {d.reason}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
                        {d.time}
                      </div>
                    </div>
                    <span
                      className="text-sm font-bold tabular"
                      style={{ color: 'var(--danger)' }}
                    >
                      − ETB {fmt(d.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── Shift Closed View ─── */
        <div className="max-w-lg mx-auto mt-10 flex flex-col gap-5">
          {zReportData && (
            <div
              className="glass-panel p-6 border-l-4"
              style={{ borderLeftColor: 'var(--primary)' }}
            >
              <div
                className="flex items-center gap-2 mb-3 font-bold text-lg"
                style={{ color: 'var(--primary)' }}
              >
                <CheckCircle size={20} />
                Shift #{zReportData.shiftNumber} Z-Report Generated
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Shift closed at {zReportData.closedAt}.
              </p>

              <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                <Row label="Expected System Cash" value={`ETB ${fmt(zReportData.expectedCash)}`} />
                <Row label="Counted Cash" value={`ETB ${fmt(zReportData.countedCash)}`} />
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>
                    Variance (Over/Short)
                  </span>
                  <span
                    className="text-sm font-extrabold tabular"
                    style={{ color: zReportData.variance >= 0 ? 'var(--primary)' : 'var(--danger)' }}
                  >
                    {zReportData.variance >= 0 ? '+' : ''}
                    ETB {fmt(zReportData.variance)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="glass-panel p-6">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--text-main)' }}>
              Open New Cashier Shift
            </h2>
            <label className="field-label">Initial Drawer Cash Float (ETB)</label>
            <input
              type="number"
              className="field-input mt-1 mb-4 text-lg font-bold"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
            />
            <button type="button" className="btn-primary w-full" style={{ minHeight: 48 }} onClick={handleOpenShift}>
              Open Shift #{shiftNumber + 1}
            </button>
          </div>
        </div>
      )}

      {/* ─── Safe Drop Modal ─── */}
      {isDropModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsDropModalOpen(false)}>
          <div className="modal-content">
            <h2 className="modal-title">Record Mid-Shift Safe Drop</h2>

            <div className="flex flex-col gap-4">
              <div>
                <label className="field-label">Amount to Transfer to Safe (ETB)</label>
                <input
                  type="number"
                  className="field-input mt-1 text-xl font-bold"
                  value={dropAmount}
                  onChange={(e) => setDropAmount(parseFloat(e.target.value) || 0)}
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">Drop Reason</label>
                <input
                  type="text"
                  className="field-input mt-1"
                  value={dropReason}
                  onChange={(e) => setDropReason(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" className="btn-secondary flex-1" onClick={() => setIsDropModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary flex-1" onClick={handleRecordDrop}>
                Confirm Drop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Blind Close Shift Modal ─── */}
      {isCloseModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsCloseModalOpen(false)}>
          <div className="modal-content">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={20} style={{ color: 'var(--danger)' }} />
              <h2 className="modal-title mb-0">Blind Close Cashier Shift</h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
              Enter the total physical cash counted in the drawer. The system will calculate the
              discrepancy (variance) against expected sales.
            </p>

            <label className="field-label">Physical Counted Cash (ETB)</label>
            <input
              type="number"
              className="field-input mt-1 text-2xl font-extrabold"
              value={countedCash}
              onChange={(e) => setCountedCash(parseFloat(e.target.value) || 0)}
              autoFocus
            />

            <div
              className="flex justify-between items-center mt-3 px-3 py-2.5 rounded-lg text-sm"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Expected in drawer</span>
              <span className="font-bold tabular" style={{ color: 'var(--primary)' }}>
                ETB {fmt(expectedCashInDrawer)}
              </span>
            </div>

            <div className="flex gap-3 mt-6">
              <button type="button" className="btn-secondary flex-1" onClick={() => setIsCloseModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger flex-1" onClick={handleCloseShift}>
                Submit Z-Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
