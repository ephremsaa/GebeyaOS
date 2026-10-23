import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Plus,
  Search,
  Barcode,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Printer,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  X,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { playScanChime, playErrorBuzz } from '../../utils/audioFeedback';

interface StockTakeSummary {
  id: string;
  countNumber: string;
  scope: 'FULL' | 'CATEGORY' | 'RANDOM_SAMPLE';
  categoryName?: string;
  status: 'IN_PROGRESS' | 'RECONCILED' | 'CANCELLED';
  notes?: string;
  conductedByName?: string;
  reconciledByName?: string;
  startedAt: string;
  completedAt?: string;
  itemCount: number;
  totalVarianceUnits: number;
  totalVarianceCost: number;
}

interface StockTakeItemDetail {
  id: string;
  productId: string;
  sku: string;
  nameEn: string;
  nameAm?: string;
  uomCode: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unitCost: number;
  varianceValue: number;
  barcodes: string[];
}

export const StockTakeView: React.FC = () => {
  const { t, language } = useI18n();
  const { currentUser, hasRole } = useAuth();

  const [sessions, setSessions] = useState<StockTakeSummary[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [categories, setCategories] = useState<any[]>([]);

  // Start Modal
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);
  const [newScope, setNewScope] = useState<'FULL' | 'CATEGORY'>('FULL');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [startNotes, setStartNotes] = useState<string>('');
  const [starting, setStarting] = useState<boolean>(false);

  // Live Counting
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [filterDiscrepanciesOnly, setFilterDiscrepanciesOnly] = useState<boolean>(false);
  const [itemSearch, setItemSearch] = useState<string>('');
  const [savingCounts, setSavingCounts] = useState<boolean>(false);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [reconcileNotes, setReconcileNotes] = useState<string>('');
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);

  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/inventory/stock-takes');
      if (res.ok) {
        const data = await res.json();
        setSessions(data || []);
      }
    } catch (err) {
      console.error('Failed to load stock takes', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/inventory/stock-takes/${id}`);
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data);
      }
    } catch (err) {
      console.error('Failed to load session details', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetch('/api/products/categories')
      .then((r) => r.json())
      .then((data) => setCategories(data || []))
      .catch(() => {});
  }, []);

  // Hardware wedge barcode scanner listener (<45ms inter-keystroke interval)
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      const now = performance.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = barcodeBufferRef.current.trim();
        barcodeBufferRef.current = '';
        if (code.length >= 3) {
          handleScannedBarcode(code);
        }
      } else if (e.key.length === 1) {
        if (diff > 50) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession]);

  const handleScannedBarcode = (code: string) => {
    if (!activeSession) return;
    const itemIndex = activeSession.items.findIndex(
      (item: StockTakeItemDetail) =>
        item.sku.toLowerCase() === code.toLowerCase() ||
        item.barcodes.some((b) => b.toLowerCase() === code.toLowerCase()),
    );

    if (itemIndex >= 0) {
      playScanChime();
      const updated = [...activeSession.items];
      const target = updated[itemIndex];
      const newCount = target.countedQuantity + 1;
      const newVariance = newCount - target.systemQuantity;
      updated[itemIndex] = {
        ...target,
        countedQuantity: newCount,
        variance: newVariance,
        varianceValue: Number((newVariance * target.unitCost).toFixed(2)),
      };
      setActiveSession({ ...activeSession, items: updated });
    } else {
      playErrorBuzz();
      alert(`Barcode "${code}" not found in this stocktake scope.`);
    }
  };

  const handleUpdateCount = (productId: string, newCount: number) => {
    if (!activeSession) return;
    const updated = activeSession.items.map((item: StockTakeItemDetail) => {
      if (item.productId === productId) {
        const count = Math.max(0, newCount);
        const variance = count - item.systemQuantity;
        return {
          ...item,
          countedQuantity: count,
          variance,
          varianceValue: Number((variance * item.unitCost).toFixed(2)),
        };
      }
      return item;
    });
    setActiveSession({ ...activeSession, items: updated });
  };

  const handleSaveCounts = async () => {
    if (!activeSession) return;
    setSavingCounts(true);
    try {
      const itemsPayload = activeSession.items.map((i: StockTakeItemDetail) => ({
        productId: i.productId,
        countedQuantity: i.countedQuantity,
      }));

      const res = await fetch(`/api/inventory/stock-takes/${activeSession.id}/counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsPayload }),
      });
      if (res.ok) {
        alert('Stock counts saved successfully.');
      }
    } catch (err) {
      console.error('Failed to save counts', err);
    } finally {
      setSavingCounts(false);
    }
  };

  const handleStartStocktake = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    try {
      const res = await fetch('/api/inventory/stock-takes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: newScope,
          categoryId: newScope === 'CATEGORY' ? selectedCategory : undefined,
          notes: startNotes || undefined,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setIsStartModalOpen(false);
        loadSessionDetails(created.id);
        fetchSessions();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to start stock take');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred');
    } finally {
      setStarting(false);
    }
  };

  const handleReconcile = async () => {
    if (!activeSession) return;
    setReconciling(true);
    try {
      // First ensure latest counts are saved
      await fetch(`/api/inventory/stock-takes/${activeSession.id}/counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: activeSession.items.map((i: any) => ({
            productId: i.productId,
            countedQuantity: i.countedQuantity,
          })),
        }),
      });

      // Now reconcile
      const res = await fetch(`/api/inventory/stock-takes/${activeSession.id}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: reconcileNotes }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`Stock take reconciled successfully! ${result.adjustmentsRecorded} adjustment ledger records created.`);
        setIsReconcileModalOpen(false);
        loadSessionDetails(activeSession.id);
        fetchSessions();
      } else {
        const err = await res.json();
        alert(err.message || 'Failed to reconcile stock take');
      }
    } catch (err: any) {
      alert(err.message || 'Error occurred during reconciliation');
    } finally {
      setReconciling(false);
    }
  };

  // Filter items for display
  const displayedItems = (activeSession?.items || []).filter((item: StockTakeItemDetail) => {
    if (filterDiscrepanciesOnly && Math.abs(item.variance) < 0.001) return false;
    if (itemSearch) {
      const q = itemSearch.toLowerCase();
      return (
        item.nameEn.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.nameAm && item.nameAm.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const totalItemsCounted = (activeSession?.items || []).filter(
    (i: StockTakeItemDetail) => i.countedQuantity > 0,
  ).length;
  const netVarianceUnits = (activeSession?.items || []).reduce(
    (sum: number, i: StockTakeItemDetail) => sum + i.variance,
    0,
  );
  const netVarianceCost = (activeSession?.items || []).reduce(
    (sum: number, i: StockTakeItemDetail) => sum + i.varianceValue,
    0,
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 overflow-hidden select-none">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="text-purple-600" size={24} />
            {language === 'am' ? 'የክምችት ቆጠራ እና ማስተካከያ' : 'Stocktake & Physical Cycle Count'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የሱቅ ወይም የምድብ ቆጠራ፣ የልዩነት ሪፖርት እና ወደ ሒሳብ መዝገብ ማስተካከል'
              : 'Audit physical on-shelf stock, scan-to-count, compute variances, and post manager reconciliations.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSession && (
            <button
              onClick={() => setActiveSession(null)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 transition"
            >
              &larr; {language === 'am' ? 'ወደ ዝርዝር ተመለስ' : 'Back to Sessions'}
            </button>
          )}

          <button
            onClick={() => setIsStartModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
          >
            <Plus size={16} />
            {language === 'am' ? 'አዲስ ቆጠራ ጀምር' : 'Start Stocktake'}
          </button>
        </div>
      </div>

      {/* 2. Main Content: Active Count Workspace vs Sessions History */}
      {activeSession ? (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Active Session Status Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-black text-purple-600 px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                {activeSession.countNumber}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white uppercase">
                    Scope: {activeSession.scope}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      activeSession.status === 'RECONCILED'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {activeSession.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Conducted by {activeSession.conductedByName || 'Storekeeper'} • {activeSession.items.length} total SKUs
                </div>
              </div>
            </div>

            {/* Variance Metrics Summary */}
            <div className="flex items-center gap-6 text-xs">
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Audited Progress</div>
                <div className="font-mono font-black text-slate-900 dark:text-white">
                  {totalItemsCounted} / {activeSession.items.length} ({Math.round((totalItemsCounted / activeSession.items.length) * 100)}%)
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Net Variance Units</div>
                <div className={`font-mono font-black ${netVarianceUnits < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                  {netVarianceUnits > 0 ? `+${netVarianceUnits}` : netVarianceUnits} units
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold">Discrepancy Value</div>
                <div className={`font-mono font-black ${netVarianceCost < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                  {netVarianceCost.toFixed(2)} ETB
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {activeSession.status === 'IN_PROGRESS' && (
                <>
                  <button
                    onClick={handleSaveCounts}
                    disabled={savingCounts}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition"
                  >
                    {savingCounts ? 'Saving...' : 'Save Draft'}
                  </button>

                  <button
                    onClick={() => setIsReconcileModalOpen(true)}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition active:scale-95"
                  >
                    <CheckCircle2 size={15} />
                    {language === 'am' ? 'ሒሳብ አስማማ' : 'Reconcile to Ledger'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            {/* Quick Barcode Scan Box */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && barcodeInput.trim()) {
                      handleScannedBarcode(barcodeInput.trim());
                      setBarcodeInput('');
                    }
                  }}
                  placeholder="Scan or enter barcode (+1)..."
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold focus:outline-hidden"
                />
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                (Continuous wedge scanner listener active)
              </span>
            </div>

            {/* Search items & discrepancy filter */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="Filter items..."
                  className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-hidden"
                />
              </div>

              <button
                onClick={() => setFilterDiscrepanciesOnly(!filterDiscrepanciesOnly)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  filterDiscrepanciesOnly
                    ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                Discrepancies Only ({activeSession.items.filter((i: any) => Math.abs(i.variance) > 0.001).length})
              </button>
            </div>
          </div>

          {/* Items Audit Table */}
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">SKU / Product</th>
                    <th className="py-3 px-4 text-center">UOM</th>
                    <th className="py-3 px-4 text-right">System Expected</th>
                    <th className="py-3 px-4 text-center">Physical Count</th>
                    <th className="py-3 px-4 text-right">Variance Units</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Variance Value</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedItems.map((item: StockTakeItemDetail) => {
                    const hasDiscrepancy = Math.abs(item.variance) > 0.001;
                    const isMissing = item.variance < 0;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition ${
                          hasDiscrepancy ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {item.nameEn}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {item.sku}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-slate-400">
                          {item.uomCode}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-600 dark:text-slate-300">
                          {item.systemQuantity.toLocaleString('en-US')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            {activeSession.status === 'IN_PROGRESS' ? (
                              <>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.countedQuantity}
                                  onChange={(e) =>
                                    handleUpdateCount(item.productId, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-bold text-xs"
                                />
                                <button
                                  onClick={() => handleUpdateCount(item.productId, item.countedQuantity + 1)}
                                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold text-xs text-slate-700 dark:text-slate-200 flex items-center justify-center"
                                  title="+1"
                                >
                                  +1
                                </button>
                                <button
                                  onClick={() => handleUpdateCount(item.productId, item.countedQuantity + 5)}
                                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold text-xs text-slate-700 dark:text-slate-200 flex items-center justify-center"
                                  title="+5"
                                >
                                  +5
                                </button>
                              </>
                            ) : (
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {item.countedQuantity}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black">
                          <span
                            className={
                              item.variance > 0
                                ? 'text-emerald-600'
                                : item.variance < 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }
                          >
                            {item.variance > 0 ? `+${item.variance}` : item.variance}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500">
                          {item.unitCost.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black">
                          <span
                            className={
                              item.varianceValue > 0
                                ? 'text-emerald-600'
                                : item.varianceValue < 0
                                ? 'text-rose-600'
                                : 'text-slate-400'
                            }
                          >
                            {item.varianceValue.toFixed(2)} ETB
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {hasDiscrepancy ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                              <AlertTriangle size={11} /> Discrepancy
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              <Check size={11} /> Match
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Past Sessions History List */
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              {language === 'am' ? 'ያለፉ የቆጠራ ክፍለ-ጊዜዎች' : 'Stocktake Sessions History'}
            </h2>
            <button
              onClick={fetchSessions}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Count Number</th>
                  <th className="py-3 px-4">Scope</th>
                  <th className="py-3 px-4">Conducted By</th>
                  <th className="py-3 px-4">Started At</th>
                  <th className="py-3 px-4 text-center">SKUs Audited</th>
                  <th className="py-3 px-4 text-right">Variance Units</th>
                  <th className="py-3 px-4 text-right">Variance Cost</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No stocktake sessions found. Click "Start Stocktake" to begin a count.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => loadSessionDetails(s.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-purple-600">
                        {s.countNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {s.scope} {s.categoryName ? `(${s.categoryName})` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {s.conductedByName || 'Staff'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(s.startedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {s.itemCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={s.totalVarianceUnits < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                          {s.totalVarianceUnits}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span className={s.totalVarianceCost < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                          {s.totalVarianceCost.toFixed(2)} ETB
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'RECONCILED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <ChevronRight size={16} className="text-slate-400 mx-auto" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Start Stocktake Modal */}
      {isStartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <ClipboardList className="text-purple-600" size={20} />
              {language === 'am' ? 'አዲስ የክምችት ቆጠራ ጀምር' : 'Start Stocktake Session'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Freezes current ledger snapshot and generates physical count audit sheets.
            </p>

            <form onSubmit={handleStartStocktake} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Count Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewScope('FULL')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      newScope === 'FULL'
                        ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    Entire Supermarket
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewScope('CATEGORY')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      newScope === 'CATEGORY'
                        ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    By Category
                  </button>
                </div>
              </div>

              {newScope === 'CATEGORY' && (
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                    Select Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  >
                    <option value="">Select a category...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Session Notes (Optional)
                </label>
                <input
                  type="text"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                  placeholder="e.g. End of Month Beverage Audit"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStartModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={starting}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition active:scale-95 disabled:opacity-50"
                >
                  {starting ? 'Generating...' : 'Start Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Manager Reconciliation Modal */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600" size={20} />
              Confirm Ledger Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              This will atomically commit <strong className="text-slate-900 dark:text-white">COUNT_VARIANCE</strong> adjustment records into the append-only stock ledger for all items with non-zero discrepancies.
            </p>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mb-4 text-xs">
              <div className="flex justify-between font-bold mb-1">
                <span>Total Items with Discrepancy:</span>
                <span>{activeSession.items.filter((i: any) => Math.abs(i.variance) > 0.001).length}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Net Value Impact:</span>
                <span className={netVarianceCost < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}>
                  {netVarianceCost.toFixed(2)} ETB
                </span>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                Manager Sign-off Reason / Notes
              </label>
              <textarea
                value={reconcileNotes}
                onChange={(e) => setReconcileNotes(e.target.value)}
                placeholder="e.g. Approved monthly physical reconciliation by Branch Manager."
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsReconcileModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReconcile}
                disabled={reconciling}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition active:scale-95 disabled:opacity-50"
              >
                {reconciling ? 'Reconciling...' : 'Confirm Reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
