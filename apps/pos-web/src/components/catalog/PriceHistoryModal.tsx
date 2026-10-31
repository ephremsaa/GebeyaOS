import React, { useState, useEffect } from 'react';
import { History, X, ArrowUpRight, ArrowDownRight, Tag, AlertCircle, Check, DollarSign } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { posApi } from '../../utils/pos-api';

interface PriceLog {
  id: string;
  product_id: string;
  branch_id?: string | null;
  old_price: string | number;
  new_price: string | number;
  reason: string;
  changed_by?: string | null;
  created_at: string;
}

interface PriceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: {
    id: string;
    sku: string;
    name_en: string;
    base_price: number | string;
    override_price?: number | string | null;
  } | null;
  onPriceUpdated?: () => void;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  isOpen,
  onClose,
  product,
  onPriceUpdated,
}) => {
  const { language } = useI18n();
  const { hasPermission, currentUser } = useAuth();
  const [logs, setLogs] = useState<PriceLog[]>([]);
  const [loading, setLoading] = useState(false);

  // New Price Change form
  const [newPrice, setNewPrice] = useState<number>(0);
  const [reason, setReason] = useState<string>('');
  const [isBranchOverride, setIsBranchOverride] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canChangePrice = hasPermission('pricing.override') || hasPermission('pos.override_price') || currentUser?.role === 'HQ_ADMIN' || currentUser?.role === 'BRANCH_MANAGER';

  useEffect(() => {
    if (isOpen && product) {
      setNewPrice(Number(product.override_price ?? product.base_price));
      setReason('');
      setError(null);
      setSuccess(null);
      fetchHistory();
    }
  }, [isOpen, product]);

  const fetchHistory = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const history = await posApi.getPriceHistory(product.id);
      setLogs(history || []);
    } catch (err) {
      console.error('Failed to fetch price history', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !product) return null;

  const currentPrice = Number(product.override_price ?? product.base_price);

  const handleUpdatePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPrice <= 0) {
      setError('Price must be greater than zero.');
      return;
    }
    if (!reason.trim()) {
      setError('Price adjustment reason is required for compliance audit logs.');
      return;
    }

    setSubmitting(true);
    try {
      await posApi.updatePrice(product.id, {
        new_price: newPrice,
        reason: reason.trim(),
        branch_id: isBranchOverride ? (currentUser?.branchId || '018e0000-0000-7000-8000-000000000020') : undefined,
        changed_by: currentUser?.id,
      });

      setSuccess('Price updated and logged to audit trail.');
      setReason('');
      fetchHistory();
      if (onPriceUpdated) onPriceUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to update price');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                {language === 'am' ? 'የዋጋ ለውጥ ታሪክ' : 'Price Change Log & Audit Trail'}
              </h2>
              <p className="text-xs text-slate-500">
                {product.name_en} <span className="font-mono text-[11px] text-slate-400">({product.sku})</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Price Change Form (if user has permission) */}
          {canChangePrice ? (
            <form onSubmit={handleUpdatePrice} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <DollarSign size={14} className="text-amber-500" />
                  {language === 'am' ? 'አዲስ ዋጋ አስተካክል' : 'Adjust Selling Price'}
                </h3>
                <span className="text-xs font-bold text-slate-500">
                  Current: <span className="text-slate-900 dark:text-white font-mono">{currentPrice.toFixed(2)} ETB</span>
                </span>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  {error}
                </div>
              )}

              {success && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 text-xs flex items-center gap-2">
                  <Check size={15} />
                  {success}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {language === 'am' ? 'አዲስ የመሸጫ ዋጋ (ብር) *' : 'New Price (ETB) *'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newPrice || ''}
                    onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                    {language === 'am' ? 'ወሰን (Scope)' : 'Price Authority Scope'}
                  </label>
                  <div className="flex items-center gap-2 pt-1">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={!isBranchOverride}
                        onChange={() => setIsBranchOverride(false)}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      Master HQ Base Price
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={isBranchOverride}
                        onChange={() => setIsBranchOverride(true)}
                        className="text-amber-500 focus:ring-amber-500"
                      />
                      Branch Override
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  {language === 'am' ? 'የዋጋ ለውጥ ምክንያት (ግዴታ) *' : 'Reason for Adjustment (Mandatory Audit Requirement) *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Supplier invoice price increase, periodic HQ tariff review"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting || newPrice === currentPrice || !reason.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Check size={14} />
                  {submitting ? 'Updating...' : (language === 'am' ? 'ዋጋ ቀይር እና መዝግብ' : 'Apply & Log Price Change')}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              Price modifications require the <strong>"change price"</strong> permission.
            </div>
          )}

          {/* Historical Logs List */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
              {language === 'am' ? 'የቀደምት ዋጋ ለውጦች' : 'Historical Price Log'}
            </h3>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading price history...</div>
            ) : logs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                No previous price changes recorded for this item.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {logs.map((log) => {
                  const oldP = Number(log.old_price);
                  const newP = Number(log.new_price);
                  const diff = newP - oldP;
                  const pct = oldP > 0 ? ((diff / oldP) * 100).toFixed(1) : '0';
                  const isUp = diff >= 0;

                  return (
                    <div key={log.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">
                            {newP.toFixed(2)} ETB
                          </span>
                          <span className="text-xs text-slate-400 line-through font-mono">
                            {oldP.toFixed(2)} ETB
                          </span>
                          <span
                            className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                              isUp
                                ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600'
                                : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600'
                            }`}
                          >
                            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {isUp ? `+${diff.toFixed(2)}` : diff.toFixed(2)} ({pct}%)
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {log.branch_id ? 'Branch Override' : 'HQ Master'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                          <span className="font-semibold text-slate-500">Reason:</span> {log.reason}
                        </p>
                      </div>

                      <div className="text-left sm:text-right text-[11px] text-slate-400">
                        <div>{new Date(log.created_at).toLocaleString()}</div>
                        {log.changed_by && (
                          <div className="text-[10px] text-slate-500">
                            User: {log.changed_by.slice(0, 8)}...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition"
          >
            {language === 'am' ? 'ዝጋ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
