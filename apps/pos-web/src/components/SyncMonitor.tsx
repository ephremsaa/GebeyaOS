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
  ArrowDownLeft,
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

export const SyncMonitor: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now (22:54:10)');
  const [events, setEvents] = useState<SyncEventItem[]>([
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
      payloadSummary: 'Damaged item write-off: FLOUR-TEFF-MAGNA-5K (-1 bag, DAMAGED_EXPIRED)',
    },
    {
      id: 'outbox-03',
      eventType: 'SHIFT_CLOSED',
      aggregateType: 'Shift',
      aggregateId: 'SHIFT-20261021-01',
      status: 'DELIVERED',
      retryCount: 0,
      occurredAt: '2026-10-21 21:00:15',
      payloadSummary: 'Z-Report closed: Cashier Bethlehem, Over/Short: 0.00 ETB',
    },
    {
      id: 'outbox-04',
      eventType: 'GRN_RECEIVED',
      aggregateType: 'GoodsReceivedNote',
      aggregateId: 'GRN-20261021-008',
      status: 'PENDING',
      retryCount: 0,
      occurredAt: '2026-10-21 22:50:33',
      payloadSummary: 'Received from Alfoz Trading: 40 units Anchor Milk, AVCO updated to ETB 85.00',
    },
  ]);

  const handleTriggerSync = () => {
    if (!isOnline) {
      alert('Branch is currently in Offline Mode! Toggle connection to online to sync with HQ server.');
      return;
    }
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date().toLocaleTimeString());
      setEvents((prev) =>
        prev.map((e) => ({ ...e, status: 'DELIVERED' }))
      );
    }, 1200);
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

  const pendingCount = events.filter((e) => e.status === 'PENDING').length;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database size={24} color="var(--primary)" />
            Local-Server-First Sync Engine & HQ Replication
          </h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Bidirectional Outbox Queue & Conflict Resolution (Authority Matrix)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Toggle Online/Offline */}
          <button
            onClick={() => setIsOnline(!isOnline)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              background: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: isOnline ? '#10b981' : '#ef4444',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            {isOnline ? 'Branch LAN: Connected to HQ' : 'Branch LAN: Offline Standalone'}
          </button>

          {/* Manual Sync Trigger */}
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: '#000',
              fontWeight: 700,
              fontSize: '0.85rem',
              opacity: isSyncing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
            {isSyncing ? 'Synchronizing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Sync Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Branch Outbox Queue</span>
            <CloudUpload size={18} color="var(--primary)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: pendingCount > 0 ? '#f59e0b' : '#10b981' }}>
            {pendingCount} Pending
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            {isOnline ? 'Pushing queued deltas to HQ' : 'Safely queued locally on SQLite/PG'}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>HQ Catalog Pull</span>
            <CloudDownload size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '8px', color: '#60a5fa' }}>
            Up To Date
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Version v14.0 (Central master catalog)
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Conflict Resolution</span>
            <ShieldCheck size={18} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, marginTop: '10px', color: '#34d399' }}>
            Authority Matrix
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Branch owns Sales/Cash; HQ owns Global Price
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
            <span>Last Successful Sync</span>
            <Clock size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '12px', color: 'var(--text-main)' }}>
            {lastSyncTime}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Auto-sync interval: every 60s
          </div>
        </div>
      </div>

      {/* Authority Matrix Architectural Info Banner */}
      <div
        className="glass-panel"
        style={{
          padding: '16px 20px',
          background: 'rgba(59, 130, 246, 0.08)',
          borderColor: 'rgba(59, 130, 246, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#60a5fa',
            }}
          >
            <ShieldCheck size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#93c5fd' }}>
              Multi-Branch Offline Integrity Protocol
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Even if Addis Ababa telecom internet drops for 48 hours, Bole Branch operates at 100% speed.
              Sales are recorded locally with UUIDv7 timestamps and sync automatically upon reconnection with zero duplicate charges.
            </div>
          </div>
        </div>

        <button
          onClick={handleSimulateNewEvent}
          style={{
            padding: '8px 14px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-main)',
            fontSize: '0.8rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          + Simulate POS Event
        </button>
      </div>

      {/* Outbox Replication Log Table */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CloudUpload size={18} color="var(--primary)" />
          Local Branch Outbox Queue (`sync_outbox`)
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table className="pos-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Direction</th>
                <th style={{ padding: '10px' }}>Event Type</th>
                <th style={{ padding: '10px' }}>Aggregate</th>
                <th style={{ padding: '10px' }}>Payload Summary</th>
                <th style={{ padding: '10px' }}>Timestamp</th>
                <th style={{ padding: '10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: '#34d399',
                      }}
                    >
                      <ArrowUpRight size={14} />
                      Branch → HQ
                    </span>
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                    {evt.eventType}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 600 }}>{evt.aggregateType}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{evt.aggregateId}</div>
                  </td>
                  <td style={{ padding: '10px', color: 'var(--text-muted)' }}>
                    {evt.payloadSummary}
                  </td>
                  <td style={{ padding: '10px', fontSize: '0.8rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {evt.occurredAt}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background:
                          evt.status === 'DELIVERED'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(245, 158, 11, 0.15)',
                        color: evt.status === 'DELIVERED' ? '#34d399' : '#fbbf24',
                        border: `1px solid ${
                          evt.status === 'DELIVERED'
                            ? 'rgba(16, 185, 129, 0.3)'
                            : 'rgba(245, 158, 11, 0.3)'
                        }`,
                      }}
                    >
                      {evt.status === 'DELIVERED' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {evt.status}
                    </span>
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
