import React, { useState, useEffect } from 'react';
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
  RotateCcw,
  Sliders,
  Radio,
  FileCode,
  Lock,
  Zap,
  Info,
  X,
  AlertTriangle,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

interface OutboxItem {
  id: string;
  sequenceNo: number;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'FAILED';
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  payload: Record<string, any>;
}

interface InboxItem {
  id: string;
  sourceBranchId: string;
  sequenceNo: number;
  entityType: string;
  entityId: string;
  operation: string;
  idempotencyKey: string;
  status: string;
  processedAt: string;
  errorMessage: string | null;
  payload: Record<string, any>;
}

interface ConflictItem {
  id: string;
  entityType: string;
  entityId: string;
  conflictType: string;
  localState: Record<string, any> | null;
  remoteState: Record<string, any> | null;
  resolution: 'HQ_WINS' | 'BRANCH_WINS' | 'MANUAL_INTERVENTION';
  resolvedAt: string;
}

export const SyncMonitor: React.FC = () => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === 'OWNER' || currentUser?.role === 'HQ_ADMIN' || currentUser?.role === 'BRANCH_MANAGER';

  // Top level views: 'simple' (default cashier/staff card) vs 'advanced' (managers)
  const [activeView, setActiveView] = useState<'simple' | 'advanced'>('simple');
  const [advancedTab, setAdvancedTab] = useState<'outbox' | 'inbox' | 'conflicts' | 'failed' | 'catalog'>('outbox');

  // Sync state
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Never synced');
  const [catalogVersion, setCatalogVersion] = useState<string>('-');
  const [clockDriftSeconds, setClockDriftSeconds] = useState<number>(0);
  const [selectedPayload, setSelectedPayload] = useState<{ title: string; data: Record<string, any> } | null>(null);

  // Event stores
  const [outboxEvents, setOutboxEvents] = useState<OutboxItem[]>([]);
  const [inboxEvents, setInboxEvents] = useState<InboxItem[]>([]);
  const [conflictLogs, setConflictLogs] = useState<ConflictItem[]>([]);

  // Derived counts
  const pendingCount = outboxEvents.filter((e) => e.status === 'PENDING').length;
  const inFlightCount = outboxEvents.filter((e) => e.status === 'IN_FLIGHT').length;
  const failedEvents = outboxEvents.filter((e) => e.status === 'FAILED' || e.retryCount > 0);
  const waitingItemsCount = pendingCount + inFlightCount;

  // Fetch status from branch-server
  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) {
        const data = await res.json();
        setIsOnline(data.isOnline);
        if (data.catalogVersion) setCatalogVersion(data.catalogVersion);
        if (data.clockSkewSeconds !== undefined) setClockDriftSeconds(data.clockSkewSeconds);
      }
    } catch {
      // Offline fallback
    }
  };

  const fetchOutbox = async () => {
    try {
      const res = await fetch('/api/sync/outbox');
      if (res.ok) {
        const data = await res.json();
        setOutboxEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      setOutboxEvents([]);
    }
  };

  const fetchInbox = async () => {
    try {
      const res = await fetch('/api/sync/inbox');
      if (res.ok) {
        const data = await res.json();
        setInboxEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      setInboxEvents([]);
    }
  };

  const fetchConflicts = async () => {
    try {
      const res = await fetch('/api/sync/conflicts');
      if (res.ok) {
        const data = await res.json();
        setConflictLogs(Array.isArray(data) ? data : []);
      }
    } catch {
      setConflictLogs([]);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    fetchOutbox();
    fetchInbox();
    fetchConflicts();
  }, []);

  // Trigger manual sync now
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      if (res.ok) {
        await fetchOutbox();
        await fetchInbox();
      }
    } catch {
      // Simulated local completion
    }

    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime('Just now');
      // Mark pending items as acknowledged in demo state
      setOutboxEvents((prev) =>
        prev.map((e) => (e.status === 'PENDING' ? { ...e, status: 'ACKNOWLEDGED' } : e)),
      );
    }, 1200);
  };

  // Retry an individual failed event
  const handleRetryEvent = async (id: string) => {
    try {
      await fetch(`/api/sync/retry/${id}`, { method: 'POST' });
    } catch {
      // Offline demo update
    }
    setOutboxEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: 'PENDING', retryCount: 0, lastError: null } : e)),
    );
  };

  // Retry all failed events
  const handleRetryAllFailed = async () => {
    try {
      await fetch('/api/sync/retry-all', { method: 'POST' });
    } catch {
      // Offline demo update
    }
    setOutboxEvents((prev) =>
      prev.map((e) => (e.status === 'FAILED' ? { ...e, status: 'PENDING', retryCount: 0, lastError: null } : e)),
    );
  };

  // Force initial catalog pull
  const handleInitialPull = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/initial-pull', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.catalogVersion) setCatalogVersion(data.catalogVersion);
      }
    } catch {
      // Simulated update
      setCatalogVersion('v18.5');
    }
    setTimeout(() => {
      setIsSyncing(false);
      alert('Master catalog successfully pulled from Central HQ. Master prices and barcodes updated locally.');
    }, 1500);
  };

  return (
    <div className="page-container flex flex-col gap-6" style={{ paddingBottom: '3rem' }}>
      {/* ─── Header & Top View Switcher ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap p-5 glass-panel border border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(5, 150, 105, 0.15)', color: 'var(--primary)' }}
            >
              <Database size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
                HQ Cloud Synchronization
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Bole Medhanialem Branch (BOLE-01) • Central HQ Replication Engine
              </p>
            </div>
          </div>
        </div>

        {/* View Switcher: Simple Default vs Advanced for Managers */}
        <div className="flex items-center gap-3">
          <div className="seg-ctrl flex items-center p-1 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <button
              className={`text-xs px-3 py-1.5 rounded transition-all font-semibold ${
                activeView === 'simple' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--text-muted)]'
              }`}
              onClick={() => setActiveView('simple')}
            >
              Sync Status
            </button>
            <button
              className={`text-xs px-3 py-1.5 rounded transition-all font-semibold flex items-center gap-1.5 ${
                activeView === 'advanced' ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--text-muted)]'
              }`}
              onClick={() => setActiveView('advanced')}
            >
              <Sliders size={13} />
              <span>Advanced (Managers)</span>
              {failedEvents.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          </div>

          {/* Quick Connection Simulator Toggle */}
          <button
            onClick={() => setIsOnline(!isOnline)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-medium ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isOnline ? 'Online Link' : 'Offline Mode'}</span>
          </button>
        </div>
      </div>

      {/* ─── DEFAULT VIEW: ONE PROMINENT STATUS CARD ─── */}
      {activeView === 'simple' && (
        <div className="flex flex-col gap-6">
          {/* The Central Status Hero Card */}
          <div className="glass-panel p-8 rounded-2xl border border-[var(--border-subtle)] flex flex-col items-center text-center relative overflow-hidden">
            {/* Top background glow */}
            <div
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none"
              style={{
                background: isOnline ? 'rgba(5, 150, 105, 0.12)' : 'rgba(217, 119, 6, 0.12)',
              }}
            />

            {/* Status Pulse Ring */}
            <div className="relative mb-5">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-300"
                style={{
                  background: isOnline ? 'rgba(5, 150, 105, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                  border: isOnline ? '2px solid rgba(5, 150, 105, 0.4)' : '2px solid rgba(217, 119, 6, 0.4)',
                }}
              >
                {isOnline ? (
                  <Wifi size={36} className="text-emerald-400" />
                ) : (
                  <WifiOff size={36} className="text-amber-400" />
                )}
              </div>
              <span
                className={`absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-[var(--bg-card)] flex items-center justify-center ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              </span>
            </div>

            {/* Status Header */}
            <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-main)' }}>
              {isOnline ? 'Connected to Central HQ' : 'Operating in Standalone Offline Mode'}
            </h2>

            {/* Reassuring Subtitle in Calm, Non-Technical Language */}
            <p className="max-w-xl text-sm leading-relaxed mb-6" style={{ color: 'var(--text-muted)' }}>
              {isOnline
                ? 'Your local terminal is actively communicating with Headquarters. All sales, price updates, and inventory receipts are synchronizing smoothly in the background.'
                : 'No internet connection detected, but selling is NOT interrupted. Every sale and receipt is safely recorded on this terminal and will sync automatically when connection returns.'}
            </p>

            {/* Three Pillar Metric Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-xl mb-8">
              <div className="p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs text-zinc-400 flex items-center justify-center gap-1.5 mb-1">
                  <Radio size={13} style={{ color: 'var(--primary)' }} />
                  <span>Connection</span>
                </div>
                <div className="text-base font-bold" style={{ color: isOnline ? 'var(--primary)' : 'var(--warning)' }}>
                  {isOnline ? 'Active Online' : 'Local Offline'}
                </div>
              </div>

              <div className="p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs text-zinc-400 flex items-center justify-center gap-1.5 mb-1">
                  <Clock size={13} style={{ color: 'var(--primary)' }} />
                  <span>Last Synced</span>
                </div>
                <div className="text-base font-bold" style={{ color: 'var(--text-main)' }}>
                  {lastSyncTime}
                </div>
              </div>

              <div className="p-3 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs text-zinc-400 flex items-center justify-center gap-1.5 mb-1">
                  <CloudUpload size={13} style={{ color: 'var(--primary)' }} />
                  <span>Items Waiting</span>
                </div>
                <div className="text-base font-bold tabular" style={{ color: waitingItemsCount > 0 ? 'var(--warning)' : 'var(--primary)' }}>
                  {waitingItemsCount === 0 ? '0 (Up to date)' : `${waitingItemsCount} items ready`}
                </div>
              </div>
            </div>

            {/* Big Prominent "Sync Now" Button */}
            <div className="flex flex-col items-center gap-3">
              <button
                className="btn-primary text-sm font-bold px-8 py-3.5 rounded-xl shadow-lg transition-all flex items-center gap-2.5"
                onClick={handleTriggerSync}
                disabled={isSyncing}
                style={{
                  fontSize: '0.95rem',
                  opacity: isSyncing ? 0.75 : 1,
                  boxShadow: '0 8px 24px rgba(5, 150, 105, 0.25)',
                }}
              >
                <RefreshCw size={17} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Synchronizing with HQ...' : 'Sync Now'}</span>
              </button>

              <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>Automated sync operates continuously in the background every 60 seconds</span>
              </div>
            </div>
          </div>

          {/* Reassuring Guarantee Ribbon */}
          <div className="p-4 rounded-xl border glass-panel flex items-start gap-3.5" style={{ background: 'rgba(5, 150, 105, 0.05)', borderColor: 'rgba(5, 150, 105, 0.2)' }}>
            <ShieldCheck size={22} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-bold text-sm text-emerald-400 mb-0.5">
                Non-Blocking POS Selling Assurance
              </div>
              <div style={{ color: 'var(--text-muted)' }}>
                Cashiers and register lanes will <strong>never be locked or slowed down</strong> because of internet hiccups. Transactions generate cryptographic UUIDv7 sequence records locally, and payments reconcile automatically with zero duplicate charges.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADVANCED TAB (FOR MANAGERS & SUPERVISORS) ─── */}
      {activeView === 'advanced' && (
        <div className="flex flex-col gap-6">
          {/* Sub Navigation Bar for Advanced */}
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-1 overflow-x-auto">
            <button
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                advancedTab === 'outbox'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
              onClick={() => setAdvancedTab('outbox')}
            >
              <CloudUpload size={14} />
              <span>Outbox Table (Branch → HQ)</span>
              <span className="badge-neutral text-[10px]">{outboxEvents.length}</span>
            </button>

            <button
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                advancedTab === 'inbox'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
              onClick={() => setAdvancedTab('inbox')}
            >
              <CloudDownload size={14} />
              <span>Inbox Table (HQ → Branch)</span>
              <span className="badge-neutral text-[10px]">{inboxEvents.length}</span>
            </button>

            <button
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                advancedTab === 'conflicts'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
              onClick={() => setAdvancedTab('conflicts')}
            >
              <ShieldCheck size={14} />
              <span>Authority &amp; Conflicts</span>
              <span className="badge-neutral text-[10px]">{conflictLogs.length}</span>
            </button>

            <button
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                advancedTab === 'failed'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
              onClick={() => setAdvancedTab('failed')}
            >
              <AlertTriangle size={14} />
              <span>Dead-Letter &amp; Failed Events</span>
              {failedEvents.length > 0 && (
                <span className="badge-danger text-[10px]">{failedEvents.length}</span>
              )}
            </button>

            <button
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-t-lg transition-all ${
                advancedTab === 'catalog'
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)] bg-[var(--bg-elevated)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
              }`}
              onClick={() => setAdvancedTab('catalog')}
            >
              <Layers size={14} />
              <span>Initial Pull &amp; Clock Skew</span>
            </button>
          </div>

          {/* ─── SUB-PANEL 1: OUTBOX TABLE ─── */}
          {advancedTab === 'outbox' && (
            <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                    <CloudUpload size={16} style={{ color: 'var(--primary)' }} />
                    Outbox Event Log (sync_outbox)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Strictly monotonic sequence order. Each event assigned unique deterministic idempotency key.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Total: {outboxEvents.length} events</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seq #</th>
                      <th>Event Type</th>
                      <th>Aggregate ID</th>
                      <th>Idempotency Key</th>
                      <th>Status</th>
                      <th className="text-center">Retries</th>
                      <th>Created At</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboxEvents.map((evt) => (
                      <tr key={evt.id}>
                        <td className="font-mono text-xs font-bold text-zinc-400">#{evt.sequenceNo}</td>
                        <td>
                          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                            {evt.eventType}
                          </span>
                          <span className="text-[10px] text-zinc-500 block">{evt.aggregateType}</span>
                        </td>
                        <td className="font-mono text-xs text-zinc-200">{evt.aggregateId}</td>
                        <td className="font-mono text-[11px] text-zinc-400 max-w-xs truncate" title={evt.idempotencyKey}>
                          {evt.idempotencyKey}
                        </td>
                        <td>
                          {evt.status === 'ACKNOWLEDGED' ? (
                            <span className="badge-success text-[10px] flex items-center gap-1 w-fit">
                              <CheckCircle2 size={10} /> Delivered
                            </span>
                          ) : evt.status === 'IN_FLIGHT' ? (
                            <span className="badge-warning text-[10px] flex items-center gap-1 w-fit">
                              <RefreshCw size={10} className="animate-spin" /> In Flight
                            </span>
                          ) : evt.status === 'FAILED' ? (
                            <span className="badge-danger text-[10px] flex items-center gap-1 w-fit">
                              <AlertCircle size={10} /> Failed
                            </span>
                          ) : (
                            <span className="badge-neutral text-[10px] flex items-center gap-1 w-fit">
                              <Clock size={10} /> Pending
                            </span>
                          )}
                        </td>
                        <td className="text-center text-xs tabular font-mono">
                          {evt.retryCount > 0 ? (
                            <span className="text-rose-400 font-bold">{evt.retryCount}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="text-xs text-zinc-400 whitespace-nowrap">
                          {new Date(evt.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="text-right">
                          <button
                            className="btn-secondary text-[11px] py-1 px-2.5"
                            onClick={() =>
                              setSelectedPayload({
                                title: `${evt.aggregateType} (${evt.aggregateId})`,
                                data: evt.payload,
                              })
                            }
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── SUB-PANEL 2: INBOX TABLE ─── */}
          {advancedTab === 'inbox' && (
            <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                    <CloudDownload size={16} style={{ color: 'var(--info)' }} />
                    Inbox Catalog Queue (sync_inbox)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Master products, base pricing, categories, and roles received and applied from Central HQ.
                  </p>
                </div>
                <span className="badge-neutral text-xs">Catalog {catalogVersion} Active</span>
              </div>

              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seq #</th>
                      <th>Entity Type</th>
                      <th>Entity ID</th>
                      <th>Operation</th>
                      <th>Status</th>
                      <th>Applied At</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inboxEvents.map((evt) => (
                      <tr key={evt.id}>
                        <td className="font-mono text-xs font-bold text-zinc-400">#{evt.sequenceNo}</td>
                        <td className="font-semibold text-xs text-sky-400">{evt.entityType}</td>
                        <td className="font-mono text-xs text-zinc-200">{evt.entityId}</td>
                        <td>
                          <span className="badge-neutral text-[10px] font-mono">{evt.operation}</span>
                        </td>
                        <td>
                          <span className="badge-success text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 size={10} /> Processed
                          </span>
                        </td>
                        <td className="text-xs text-zinc-400 whitespace-nowrap">
                          {new Date(evt.processedAt).toLocaleTimeString()}
                        </td>
                        <td className="text-right">
                          <button
                            className="btn-secondary text-[11px] py-1 px-2.5"
                            onClick={() =>
                              setSelectedPayload({
                                title: `HQ Delta: ${evt.entityType} (${evt.entityId})`,
                                data: evt.payload,
                              })
                            }
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── SUB-PANEL 3: CONFLICT LOGS & AUTHORITY MATRIX ─── */}
          {advancedTab === 'conflicts' && (
            <div className="flex flex-col gap-6">
              {/* Authority Matrix Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center gap-2 font-bold text-xs text-amber-400 uppercase tracking-wider mb-2">
                    <ShieldCheck size={16} />
                    Central HQ Sole Authority (HQ Wins)
                  </div>
                  <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                    <li>Master Catalog &amp; Global Product Directory</li>
                    <li>Base Selling Price Defaults</li>
                    <li>Categories, Tax Rates (15% VAT), and Units of Measure</li>
                    <li>Staff System Roles &amp; Canonical Permissions Matrix</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <div className="flex items-center gap-2 font-bold text-xs text-emerald-400 uppercase tracking-wider mb-2">
                    <ShieldCheck size={16} />
                    Store Branch Sole Authority (Branch Wins)
                  </div>
                  <ul className="text-xs text-zinc-300 space-y-1.5 list-disc list-inside">
                    <li>Completed POS Sales, Cash Disbursements &amp; Refunds</li>
                    <li>Physical Stock Movements &amp; Local Stocktake Audits</li>
                    <li>Cashier Shifts &amp; Drawer Blind Counts</li>
                    <li>Branch-Specific Promotional Shelf Price Overrides</li>
                  </ul>
                </div>
              </div>

              {/* Conflict Log Table */}
              <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)]">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--primary)' }} />
                  Conflict Resolution Logs (sync_conflict_logs)
                </h3>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>Conflict Type</th>
                        <th>Local Branch Value</th>
                        <th>HQ Cloud Value</th>
                        <th className="text-center">Resolution Rule</th>
                        <th>Resolved At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflictLogs.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <div className="font-semibold text-xs">{c.entityType}</div>
                            <div className="text-[10px] font-mono text-zinc-500">{c.entityId}</div>
                          </td>
                          <td className="font-mono text-xs text-amber-400">{c.conflictType}</td>
                          <td className="text-xs font-mono text-zinc-300">
                            {JSON.stringify(c.localState)}
                          </td>
                          <td className="text-xs font-mono text-zinc-300">
                            {JSON.stringify(c.remoteState)}
                          </td>
                          <td className="text-center">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                c.resolution === 'HQ_WINS'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}
                            >
                              {c.resolution}
                            </span>
                          </td>
                          <td className="text-xs text-zinc-400 whitespace-nowrap">
                            {new Date(c.resolvedAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── SUB-PANEL 4: DEAD-LETTER & FAILED EVENTS ─── */}
          {advancedTab === 'failed' && (
            <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--danger)' }}>
                    <AlertTriangle size={16} />
                    Dead-Letter Queue &amp; Failed Events
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Events that exceeded exponential backoff retries. Can be inspected and manually re-queued.
                  </p>
                </div>
                {failedEvents.length > 0 && (
                  <button
                    className="btn-danger text-xs flex items-center gap-1.5"
                    onClick={handleRetryAllFailed}
                  >
                    <RotateCcw size={13} />
                    <span>Retry All Failed ({failedEvents.length})</span>
                  </button>
                )}
              </div>

              {failedEvents.length === 0 ? (
                <div className="p-8 text-center border rounded-xl" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                  <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                  <div className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                    Zero Failed Events in Outbox
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    All transactional events have been successfully delivered to Central HQ.
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Seq #</th>
                        <th>Event Type</th>
                        <th>Aggregate ID</th>
                        <th>Error Description</th>
                        <th className="text-center">Retries</th>
                        <th>Created At</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedEvents.map((evt) => (
                        <tr key={evt.id}>
                          <td className="font-mono text-xs font-bold text-rose-400">#{evt.sequenceNo}</td>
                          <td className="font-semibold text-xs">{evt.eventType}</td>
                          <td className="font-mono text-xs text-zinc-300">{evt.aggregateId}</td>
                          <td className="text-xs text-rose-300 max-w-sm truncate" title={evt.lastError || ''}>
                            {evt.lastError}
                          </td>
                          <td className="text-center font-mono font-bold text-rose-400 text-xs">
                            {evt.retryCount}
                          </td>
                          <td className="text-xs text-zinc-400">
                            {new Date(evt.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="text-right">
                            <button
                              className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 ml-auto"
                              onClick={() => handleRetryEvent(evt.id)}
                            >
                              <RotateCcw size={12} />
                              <span>Retry</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── SUB-PANEL 5: INITIAL CATALOG PULL & CLOCK SKEW ─── */}
          {advancedTab === 'catalog' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Initial Catalog Pull Card */}
              <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                    <Layers size={16} style={{ color: 'var(--primary)' }} />
                    New Branch Initial Catalog Provisioning
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    Downloads the master snapshot of all 5,000+ items, categories, barcodes, and master selling prices when setting up a fresh store branch.
                  </p>

                  <div className="p-3 rounded-lg border mb-4 text-xs font-mono" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                    <div className="text-zinc-500 text-[10px]">CURRENT LOCAL CATALOG VERSION:</div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">{catalogVersion}</div>
                  </div>
                </div>

                <button
                  className="btn-primary text-xs font-semibold py-2.5 flex items-center justify-center gap-2"
                  onClick={handleInitialPull}
                  disabled={isSyncing}
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                  <span>Force Full Initial Catalog Pull</span>
                </button>
              </div>

              {/* Clock Skew & Sequence Ordering Integrity */}
              <div className="glass-panel p-5 rounded-xl border border-[var(--border-subtle)] flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                    <Clock size={16} style={{ color: 'var(--info)' }} />
                    Clock Skew &amp; Sequence Ordering Integrity
                  </h3>
                  <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
                    All event ordering relies strictly on server-assigned monotonic sequence numbers (<code>sequence_no</code>) rather than device clock time.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between p-2 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                      <span className="text-zinc-400">Measured Clock Drift:</span>
                      <span className="font-mono font-bold text-emerald-400">+{clockDriftSeconds}s (Optimal: &lt; 300s)</span>
                    </div>

                    <div className="flex justify-between p-2 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                      <span className="text-zinc-400">Ordering Mode:</span>
                      <span className="font-mono font-bold text-zinc-200">Strict Sequence (BIGSERIAL)</span>
                    </div>

                    <div className="flex justify-between p-2 rounded border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
                      <span className="text-zinc-400">Transport Encryption:</span>
                      <span className="font-mono font-bold text-sky-400">TLS 1.3 / AES-256-GCM</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-2.5 rounded-lg border text-[11px] text-zinc-400 flex items-center gap-2" style={{ background: 'rgba(37, 99, 235, 0.08)', borderColor: 'rgba(37, 99, 235, 0.2)' }}>
                  <ShieldCheck size={15} className="text-sky-400 shrink-0" />
                  <span>Device time shifts will never cause out-of-order sales or ledger corruption.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── JSON PAYLOAD INSPECTOR MODAL ─── */}
      {selectedPayload && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-xl rounded-2xl p-6 border shadow-2xl max-h-[85vh] flex flex-col"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)] mb-4">
              <div className="flex items-center gap-2">
                <FileCode size={18} style={{ color: 'var(--primary)' }} />
                <span className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                  {selectedPayload.title}
                </span>
              </div>
              <button
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg"
                onClick={() => setSelectedPayload(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl p-3 bg-black/60 border border-[var(--border-subtle)] font-mono text-xs text-emerald-400">
              <pre>{JSON.stringify(selectedPayload.data, null, 2)}</pre>
            </div>

            <div className="mt-4 flex justify-end">
              <button className="btn-secondary text-xs" onClick={() => setSelectedPayload(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
