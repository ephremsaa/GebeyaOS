import React, { useState } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  CloudUpload,
  CloudDownload,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowUpRight,
} from 'lucide-react';

interface SyncEventItem {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  status: 'DELIVERED' | 'PENDING' | 'RETRYING';
  retryCount: number;
  occurredAt: string;
  payloadSummary: string;
}

const INITIAL_EVENTS: SyncEventItem[] = [
  {
    id: 'outbox-01',
    eventType: 'SALE_COMPLETED',
    aggregateType: 'Transaction',
    aggregateId: 'TX-20261021-0042',
    status: 'DELIVERED',
    retryCount: 0,
    occurredAt: '2026-10-21 22:45:12',
    payloadSummary: 'Receipt TX-20261021-0042, Total: ETB 1,120.00, VAT: ETB 146.09 (Telebirr)',
  },
  {
    id: 'outbox-02',
    eventType: 'STOCK_ADJUSTED',
    aggregateType: 'StockLedger',
    aggregateId: 'ADJ-20261021-001',
    status: 'DELIVERED',
    retryCount: 0,
    occurredAt: '2026-10-21 22:30:00',
    payloadSummary: 'Damaged item write-off: FLOUR-TEFF-MAGNA-5K (−1 bag, DAMAGED_GOODS)',
  },
  {
    id: 'outbox-03',
    eventType: 'SHIFT_CLOSED',
    aggregateType: 'Shift',
    aggregateId: 'SHIFT-20261021-01',
    status: 'DELIVERED',
    retryCount: 0,
    occurredAt: '2026-10-21 21:00:15',
    payloadSummary: 'Z-Report closed: Cashier Bethlehem T., Over/Short: 0.00 ETB',
  },
  {
    id: 'outbox-04',
    eventType: 'GRN_RECEIVED',
    aggregateType: 'GoodsReceivedNote',
    aggregateId: 'GRN-20261021-008',
    status: 'PENDING',
    retryCount: 0,
    occurredAt: '2026-10-21 22:50:33',
    payloadSummary: 'Received from Almaz Agro Industries: 40 units Anchor Milk, AVCO → ETB 85.00',
  },
];

export const SyncMonitor: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now (22:54:10)');
  const [events, setEvents] = useState<SyncEventItem[]>(INITIAL_EVENTS);

  const pendingCount = events.filter((e) => e.status === 'PENDING').length;

  const handleTriggerSync = () => {
    if (!isOnline) {
      alert('Branch is currently in Offline Mode. Toggle to Online to sync with HQ.');
      return;
    }
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString());
      setEvents((prev) => prev.map((e) => ({ ...e, status: 'DELIVERED' })));
    }, 1400);
  };

  const handleSimulateNewEvent = () => {
    const newEvt: SyncEventItem = {
      id: `outbox-0${events.length + 1}`,
      eventType: 'SALE_COMPLETED',
      aggregateType: 'Transaction',
      aggregateId: `TX-20261021-${Math.floor(1000 + Math.random() * 9000)}`,
      status: isOnline ? 'DELIVERED' : 'PENDING',
      retryCount: 0,
      occurredAt: new Date().toLocaleTimeString(),
      payloadSummary: `New POS Checkout: ETB ${(Math.random() * 800 + 100).toFixed(2)} (Cash)`,
    };
    setEvents([newEvt, ...events]);
  };

  /* status pill */
  const StatusPill = ({ status }: { status: SyncEventItem['status'] }) =>
    status === 'DELIVERED' ? (
      <span className="badge-success">
        <CheckCircle2 size={11} />
        Delivered
      </span>
    ) : status === 'RETRYING' ? (
      <span className="badge-warning">
        <RefreshCw size={11} />
        Retrying
      </span>
    ) : (
      <span className="badge-warning">
        <AlertCircle size={11} />
        Pending
      </span>
    );

  return (
    <div className="page-container flex flex-col gap-6">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Database size={22} style={{ color: 'var(--primary)' }} />
            HQ Sync &amp; Replication
          </h1>
          <p className="page-subtitle">
            Bidirectional Outbox Queue &amp; Conflict Resolution (Authority Matrix)
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Online / Offline toggle */}
          <button
            onClick={() => setIsOnline((v) => !v)}
            className={isOnline ? 'btn-secondary' : 'btn-danger'}
            style={
              isOnline
                ? {
                    color: 'var(--primary)',
                    borderColor: 'rgba(5,150,105,.3)',
                    background: 'rgba(5,150,105,.08)',
                  }
                : undefined
            }
          >
            {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
            {isOnline ? 'Connected to HQ' : 'Offline Standalone'}
          </button>

          {/* Sync Now */}
          <button
            className="btn-primary"
            onClick={handleTriggerSync}
            disabled={isSyncing}
            style={{ opacity: isSyncing ? 0.7 : 1 }}
          >
            <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* ─── Status KPI Cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Outbox Queue
            <CloudUpload size={15} style={{ color: 'var(--primary)' }} />
          </div>
          <div
            className="kpi-value tabular"
            style={{ color: pendingCount > 0 ? 'var(--warning)' : 'var(--primary)' }}
          >
            {pendingCount}
          </div>
          <div className="kpi-sub">
            {pendingCount > 0 ? 'Events pending sync' : 'All events delivered'}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            HQ Catalog Pull
            <CloudDownload size={15} style={{ color: 'var(--info)' }} />
          </div>
          <div className="kpi-value" style={{ color: 'var(--info)' }}>
            ✓ Synced
          </div>
          <div className="kpi-sub">Central master catalog v14.0</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Conflict Resolution
            <ShieldCheck size={15} style={{ color: 'var(--primary)' }} />
          </div>
          <div className="kpi-value text-xl" style={{ color: 'var(--primary)' }}>
            Auth Matrix
          </div>
          <div className="kpi-sub">Branch owns Sales · HQ owns Prices</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label flex items-center justify-between">
            Last Successful Sync
            <Clock size={15} style={{ color: 'var(--warning)' }} />
          </div>
          <div className="kpi-value text-xl">{lastSyncTime}</div>
          <div className="kpi-sub">Auto-interval: every 60 s</div>
        </div>
      </div>

      {/* ─── Offline integrity banner ─── */}
      <div
        className="glass-panel p-4 flex items-center justify-between gap-4 flex-wrap"
        style={{
          background: 'rgba(37,99,235,.06)',
          borderColor: 'rgba(37,99,235,.2)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(37,99,235,.15)' }}
          >
            <ShieldCheck size={20} style={{ color: 'var(--info)' }} />
          </div>
          <div>
            <div className="font-bold text-sm" style={{ color: 'var(--info)' }}>
              Multi-Branch Offline Integrity Protocol
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Even if Addis Ababa telecom internet drops for 48 hours, Bole Branch operates at
              100% speed. Sales are recorded locally with UUIDv7 timestamps and sync automatically
              upon reconnection with zero duplicate charges.
            </div>
          </div>
        </div>

        <button className="btn-secondary text-sm flex-shrink-0" onClick={handleSimulateNewEvent}>
          + Simulate POS Event
        </button>
      </div>

      {/* ─── Outbox Queue Table ─── */}
      <div className="glass-panel p-5">
        <h3
          className="font-bold text-base mb-4 flex items-center gap-2"
          style={{ color: 'var(--text-main)' }}
        >
          <CloudUpload size={16} style={{ color: 'var(--primary)' }} />
          Local Branch Outbox Queue (sync_outbox)
        </h3>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Event Type</th>
                <th>Aggregate</th>
                <th>Payload Summary</th>
                <th>Timestamp</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id}>
                  <td>
                    <span className="badge-success">
                      <ArrowUpRight size={11} />
                      Branch → HQ
                    </span>
                  </td>
                  <td>
                    <span
                      className="font-mono text-xs font-bold"
                      style={{ color: 'var(--primary)' }}
                    >
                      {evt.eventType}
                    </span>
                  </td>
                  <td>
                    <div className="font-semibold text-sm">{evt.aggregateType}</div>
                    <div
                      className="text-xs font-mono mt-0.5"
                      style={{ color: 'var(--text-dim)' }}
                    >
                      {evt.aggregateId}
                    </div>
                  </td>
                  <td
                    className="text-xs max-w-xs truncate"
                    style={{ color: 'var(--text-muted)' }}
                    title={evt.payloadSummary}
                  >
                    {evt.payloadSummary}
                  </td>
                  <td
                    className="text-xs whitespace-nowrap"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {evt.occurredAt}
                  </td>
                  <td className="text-center">
                    <StatusPill status={evt.status} />
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
