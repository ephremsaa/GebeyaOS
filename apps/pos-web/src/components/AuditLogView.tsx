import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Calendar,
  User,
  RefreshCw,
  Eye,
  X,
  Clock,
  Terminal,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { useAuth } from '../auth/AuthContext';

interface AuditLogRow {
  id: string;
  branch_id?: string;
  user_id?: string;
  user_name?: string;
  username?: string;
  user_role?: string;
  action: string;
  entity_name: string;
  entity_id?: string;
  ip_address?: string;
  details?: Record<string, any> | string;
  created_at: string;
}

export const AuditLogView: React.FC = () => {
  const { language } = useI18n();
  const { currentUser } = useAuth();

  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [entityFilter, setEntityFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [selectedLog, setSelectedLog] = useState<AuditLogRow | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.append('action', actionFilter);
      if (entityFilter) params.append('entityName', entityFilter);

      const now = new Date();
      if (dateRange === 'today') {
        const start = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        params.append('startDate', start);
      } else if (dateRange === '7d') {
        const start = new Date(Date.now() - 7 * 86400000).toISOString();
        params.append('startDate', start);
      } else if (dateRange === '30d') {
        const start = new Date(Date.now() - 30 * 86400000).toISOString();
        params.append('startDate', start);
      }
      params.append('limit', '100');

      const res = await fetch(`/api/system/audit-logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.rows || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter, dateRange]);

  const getActionBadge = (action: string) => {
    let classes = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    if (action.includes('LOGIN')) classes = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300';
    else if (action.includes('PRICE') || action.includes('OVERRIDE')) classes = 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
    else if (action.includes('IMPORT') || action.includes('STOCK')) classes = 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300';
    else if (action.includes('RESTORE')) classes = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
    else if (action.includes('SETTINGS')) classes = 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300';

    return (
      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-tight ${classes}`}>
        {action}
      </span>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="text-indigo-600" size={24} />
            {language === 'am' ? 'የስርዓት ኦዲት እና ክስተቶች መዝገብ' : 'Immutable System Audit Trail'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'ማን፣ መቼ፣ ከየትኛው አይፒ ምን እርምጃ እንደወሰደ የሚያሳይ የማያሻማ መዝገብ'
              : 'Verifiable accountability logs tracking user logins, discounts, price overrides, stock adjustments, and settings changes.'}
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {language === 'am' ? 'አድስ' : 'Refresh'}
        </button>
      </div>

      {/* 2. Filter Bar */}
      <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Action Filter */}
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
          >
            <option value="">All Actions</option>
            <option value="USER_LOGIN">User Logins & PIN</option>
            <option value="PRICE_OVERRIDE">Price Overrides & Discounts</option>
            <option value="STOCK_ADJUSTMENT">Stock Adjustments</option>
            <option value="IMPORT_BATCH">Excel / Bulk Imports</option>
            <option value="STOCK_TAKE">Stocktake Reconciliations</option>
            <option value="SETTINGS_UPDATE">Settings & Config Changes</option>
            <option value="SYSTEM_RESTORE">System Restores</option>
          </select>

          {/* Entity Filter */}
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus:outline-hidden"
          >
            <option value="">All Entities</option>
            <option value="users">Users & Auth</option>
            <option value="products">Products & Pricing</option>
            <option value="stock_ledger">Stock Ledger</option>
            <option value="system_settings">System Settings</option>
            <option value="sales">Sales & POS</option>
          </select>
        </div>

        {/* Date Presets */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
          <button
            onClick={() => setDateRange('today')}
            className={`px-3 py-1 rounded-lg transition ${
              dateRange === 'today'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setDateRange('7d')}
            className={`px-3 py-1 rounded-lg transition ${
              dateRange === '7d'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setDateRange('30d')}
            className={`px-3 py-1 rounded-lg transition ${
              dateRange === '30d'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setDateRange('all')}
            className={`px-3 py-1 rounded-lg transition ${
              dateRange === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* 3. Audit Log Table */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User & Role</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Entity</th>
                <th className="py-3 px-4">IP / Terminal</th>
                <th className="py-3 px-4">Details Summary</th>
                <th className="py-3 px-4 text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Loading audit trail logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No audit records found matching your filters.
                  </td>
                </tr>
              ) : (
                logs.map((row) => {
                  let detailsString = '';
                  try {
                    detailsString =
                      typeof row.details === 'object'
                        ? JSON.stringify(row.details)
                        : String(row.details || '');
                  } catch (e) {
                    detailsString = '';
                  }

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedLog(row)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {row.user_name || 'System Auto'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {row.username ? `@${row.username}` : ''}{' '}
                          {row.user_role && (
                            <span className="font-bold text-gebeya-600">[{row.user_role}]</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">{getActionBadge(row.action)}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {row.entity_name}
                        </span>
                        {row.entity_id && (
                          <div className="font-mono text-[9px] text-slate-400 truncate max-w-[100px]">
                            {row.entity_id}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                        {row.ip_address || 'LAN Terminal'}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600 dark:text-slate-400 text-[11px]">
                        {detailsString}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(row);
                          }}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition"
                          title="View JSON Payload"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 flex justify-between items-center">
          <span>Total Records: {total}</span>
          <span className="text-[11px] text-slate-400">Write-once append-only database audit log</span>
        </div>
      </div>

      {/* 4. JSON Payload Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Terminal size={16} className="text-indigo-600" />
                  Audit Event Payload Details
                </h2>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  ID: {selectedLog.id}
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Action:</span>
                  <span className="font-bold">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">User:</span>
                  <span className="font-bold">{selectedLog.user_name || 'System'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Timestamp:</span>
                  <span className="font-mono">{new Date(selectedLog.created_at).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">IP / Host:</span>
                  <span className="font-mono">{selectedLog.ip_address || '127.0.0.1 (Local)'}</span>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1.5">
                  Structured JSON Metadata:
                </span>
                <pre className="p-4 rounded-2xl bg-slate-900 text-emerald-400 font-mono text-xs overflow-x-auto leading-relaxed max-h-64">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
