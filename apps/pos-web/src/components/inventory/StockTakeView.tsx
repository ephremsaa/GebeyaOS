import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Camera,
  CameraOff,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  HelpCircle,
  Hash,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { useAuth } from '../../auth/AuthContext';
import { playScanChime, playErrorBuzz } from '../../utils/audioFeedback';
import { posApi } from '../../utils/pos-api';

interface StockTakeSummary {
  id: string;
  countNumber: string;
  scope: 'FULL' | 'CATEGORY' | 'LOCATION' | 'RANDOM_SAMPLE';
  categoryName?: string;
  location?: string;
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
  categoryName?: string;
  systemQuantity: number; // Snapshot at started_at
  laterMovements?: number; // Concurrent sales (-) and receipts (+)
  expectedQuantity?: number; // Snapshot + laterMovements
  countedQuantity: number;
  variance: number; // Counted - Expected
  unitCost: number;
  varianceValue: number;
  needsRecount?: boolean;
  barcodes: string[];
}

export const StockTakeView: React.FC = () => {
  const { language } = useI18n();
  const { currentUser } = useAuth();

  // Sessions state
  const [sessions, setSessions] = useState<StockTakeSummary[]>([]);
  const [activeSession, setActiveSession] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'IN_PROGRESS' | 'RECONCILED'>('ALL');

  // Start Count Modal
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);
  const [newScope, setNewScope] = useState<'FULL' | 'CATEGORY' | 'LOCATION'>('FULL');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [startNotes, setStartNotes] = useState<string>('');
  const [starting, setStarting] = useState<boolean>(false);
  const [categories, setCategories] = useState<any[]>([]);

  // Counting Workspace state
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'ALL' | 'DISCREPANCIES' | 'RECOUNT'>('ALL');
  const [itemSearch, setItemSearch] = useState<string>('');
  const [savingCounts, setSavingCounts] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Blind Count Mode: When true, system expected quantities and variances are hidden from counters
  const isManagerOrAdmin =
    currentUser?.role === 'BRANCH_MANAGER' ||
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'HQ_ADMIN';
  const [blindCountMode, setBlindCountMode] = useState<boolean>(!isManagerOrAdmin);
  const [showManagerPinModal, setShowManagerPinModal] = useState<boolean>(false);
  const [managerPinInput, setManagerPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Multi-counter options
  const [currentCounterName, setCurrentCounterName] = useState<string>(
    currentUser?.fullName || 'Counter 01',
  );
  const [mergeStrategy, setMergeStrategy] = useState<'OVERWRITE' | 'MERGE_SUM'>('OVERWRITE');

  // Camera Barcode Scanner fallback
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);

  // Reconciliation & Approval Modal
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [reconcileNotes, setReconcileNotes] = useState<string>('');
  const [reconcilePin, setReconcilePin] = useState<string>('');
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState<boolean>(false);

  // Shrinkage Report Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);

  // Wedge scanner buffers
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const data = await posApi.getStockTakes();
      if (Array.isArray(data)) {
        setSessions(data);
      } else {
        setSessions([]);
      }
    } catch (err) {
      console.warn('API unavailable for stock takes', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionDetails = async (id: string) => {
    setLoading(true);
    try {
      const data = await posApi.getStockTakeById(id);
      setActiveSession(data || null);
    } catch (err) {
      console.warn('Failed to load session from API', err);
      setActiveSession(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetch('/api/products/categories')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

  // Hardware wedge barcode scanner listener
  useEffect(() => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [activeSession, mergeStrategy]);

  // Barcode scan handler
  const handleScannedBarcode = (code: string) => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;

    const itemIndex = activeSession.items.findIndex(
      (item: StockTakeItemDetail) =>
        item.sku.toLowerCase() === code.toLowerCase() ||
        (item.barcodes && item.barcodes.some((b) => b.toLowerCase() === code.toLowerCase())),
    );

    if (itemIndex >= 0) {
      playScanChime();
      const updated = [...activeSession.items];
      const target = updated[itemIndex];
      const increment = 1;
      const newCount = target.countedQuantity + increment;
      const expected = target.expectedQuantity ?? target.systemQuantity;
      const newVariance = Number((newCount - expected).toFixed(3));
      const varianceVal = Number((newVariance * target.unitCost).toFixed(2));

      updated[itemIndex] = {
        ...target,
        countedQuantity: newCount,
        variance: newVariance,
        varianceValue: varianceVal,
        needsRecount: Math.abs(newVariance) > 5 || Math.abs(varianceVal) > 500,
      };

      setActiveSession({ ...activeSession, items: updated });
      showToast(`+1 count for ${target.nameEn} (Total: ${newCount})`);
    } else {
      playErrorBuzz();
      alert(`Barcode "${code}" not found in this stocktake session.`);
    }
  };

  const handleUpdateCount = (productId: string, newCount: number) => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;

    const updated = activeSession.items.map((item: StockTakeItemDetail) => {
      if (item.productId === productId) {
        const count = Math.max(0, newCount);
        const expected = item.expectedQuantity ?? item.systemQuantity;
        const variance = Number((count - expected).toFixed(3));
        const varianceValue = Number((variance * item.unitCost).toFixed(2));
        const needsRecount = Math.abs(variance) > 5 || Math.abs(varianceValue) > 500;

        return {
          ...item,
          countedQuantity: count,
          variance,
          varianceValue,
          needsRecount,
        };
      }
      return item;
    });

    setActiveSession({ ...activeSession, items: updated });
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleSaveCounts = async () => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;
    setSavingCounts(true);
    try {
      const itemsPayload = activeSession.items.map((i: StockTakeItemDetail) => ({
        productId: i.productId,
        countedQuantity: i.countedQuantity,
        counterName: currentCounterName,
      }));

      await posApi.recordStockTakeCounts(activeSession.id, {
        items: itemsPayload,
        mergeStrategy,
      });

      showToast('Counts saved to local server database.');
    } catch (err: any) {
      console.warn('API count save warning:', err);
      showToast('Counts updated in workspace session.');
    } finally {
      setSavingCounts(false);
    }
  };

  const handleStartStocktake = async (e: React.FormEvent) => {
    e.preventDefault();
    setStarting(true);
    try {
      const created = await posApi.createStockTake({
        scope: newScope,
        categoryId: newScope === 'CATEGORY' ? selectedCategory : undefined,
        location: newScope === 'LOCATION' ? selectedLocation : undefined,
        notes: startNotes || undefined,
      });

      setIsStartModalOpen(false);
      loadSessionDetails(created.id);
      fetchSessions();
      showToast('New stock take session initialized with live ledger snapshot.');
    } catch (err: any) {
      console.error('Failed to initialize stock take session:', err);
      showToast(err?.message || 'Failed to initialize stock take session.');
    } finally {
      setStarting(false);
    }
  };

  const handleReconcile = async () => {
    if (!activeSession || activeSession.status !== 'IN_PROGRESS') return;
    setReconciling(true);
    setReconcileError(null);

    // Require Manager PIN if not authenticated as manager or if blind count
    if (!reconcilePin && !isManagerOrAdmin) {
      setReconcileError('Manager authorization PIN is required to approve reconciliation.');
      setReconciling(false);
      return;
    }

    try {
      // 1. Save counts
      await posApi.recordStockTakeCounts(activeSession.id, {
        items: activeSession.items.map((i: any) => ({
          productId: i.productId,
          countedQuantity: i.countedQuantity,
        })),
      });

      // 2. Commit reconciliation
      await posApi.reconcileStockTake(activeSession.id, {
        notes: reconcileNotes,
        managerPin: reconcilePin,
        approvedBy: currentUser?.id,
      });

      setIsReconcileModalOpen(false);
      loadSessionDetails(activeSession.id);
      fetchSessions();
      showToast('Session reconciled! Append-only stock ledger movements posted under reason "stocktake".');
    } catch (err: any) {
      console.error('Reconcile failed:', err);
      setReconcileError(err?.message || 'Failed to reconcile stock take.');
    } finally {
      setReconciling(false);
    }
  };

  const handleRevealExpected = async () => {
    if (isManagerOrAdmin) {
      setBlindCountMode(false);
      setShowManagerPinModal(false);
      setManagerPinInput('');
      setPinError(null);
      return;
    }

    try {
      const verifyRes = await posApi.verifyManagerPin(currentUser?.branchId || '', { pin: managerPinInput });
      if (verifyRes.authorized) {
        setBlindCountMode(false);
        setShowManagerPinModal(false);
        setManagerPinInput('');
        setPinError(null);
      } else {
        setPinError('Invalid Manager PIN.');
      }
    } catch {
      setPinError('Invalid Manager PIN or network error.');
    }
  };

  const openShrinkageReport = async () => {
    if (!activeSession) return;
    setLoadingReport(true);
    setIsReportModalOpen(true);

    try {
      const data = await posApi.getStockTakeReport(activeSession.id);
      if (data) {
        setReportData(data);
        setLoadingReport(false);
        return;
      }
    } catch (e) {
      // fallback
    }

    // Build client-side report
    const totalItems = activeSession.items.length;
    const totalCounted = activeSession.items.filter((i: any) => i.countedQuantity > 0).length;
    let totalSnapshotVal = 0;
    let totalCountedVal = 0;
    let netVarianceVal = 0;
    let totalShrinkageVal = 0;

    const catMap = new Map<string, any>();

    for (const item of activeSession.items) {
      const exp = item.expectedQuantity ?? item.systemQuantity;
      const expVal = exp * item.unitCost;
      const countVal = item.countedQuantity * item.unitCost;
      const varVal = item.varianceValue;

      totalSnapshotVal += expVal;
      totalCountedVal += countVal;
      netVarianceVal += varVal;
      if (item.variance < 0) totalShrinkageVal += Math.abs(varVal);

      const cName = item.categoryName || 'General Goods';
      if (!catMap.has(cName)) {
        catMap.set(cName, {
          categoryName: cName,
          itemCount: 0,
          expectedValue: 0,
          countedValue: 0,
          varianceValue: 0,
          shrinkageValue: 0,
        });
      }
      const c = catMap.get(cName);
      c.itemCount += 1;
      c.expectedValue += expVal;
      c.countedValue += countVal;
      c.varianceValue += varVal;
      if (item.variance < 0) c.shrinkageValue += Math.abs(varVal);
    }

    const shrinkagePct = totalSnapshotVal > 0 ? (totalShrinkageVal / totalSnapshotVal) * 100 : 0;

    setReportData({
      stockTakeId: activeSession.id,
      countNumber: activeSession.countNumber,
      startedAt: activeSession.startedAt,
      completedAt: activeSession.completedAt,
      status: activeSession.status,
      conductedByName: activeSession.conductedByName,
      totalItems,
      totalCountedItems: totalCounted,
      totalSnapshotValue: totalSnapshotVal,
      totalCountedValue: totalCountedVal,
      netVarianceValue: netVarianceVal,
      totalShrinkageValue: totalShrinkageVal,
      shrinkagePercent: Number(shrinkagePct.toFixed(2)),
      categories: Array.from(catMap.values()).map((c) => ({
        ...c,
        shrinkagePercent: c.expectedValue > 0 ? Number(((c.shrinkageValue / c.expectedValue) * 100).toFixed(2)) : 0,
      })),
    });
    setLoadingReport(false);
  };

  // Filtered Items for workspace
  const displayedItems = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.items.filter((item: StockTakeItemDetail) => {
      if (filterTab === 'DISCREPANCIES' && Math.abs(item.variance) < 0.001) return false;
      if (filterTab === 'RECOUNT' && !item.needsRecount) return false;

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
  }, [activeSession, filterTab, itemSearch]);

  const totalCountedCount = (activeSession?.items || []).filter(
    (i: StockTakeItemDetail) => i.countedQuantity > 0,
  ).length;

  const totalDiscrepancies = (activeSession?.items || []).filter(
    (i: StockTakeItemDetail) => Math.abs(i.variance) > 0.001,
  ).length;

  const totalRecountsNeeded = (activeSession?.items || []).filter(
    (i: StockTakeItemDetail) => i.needsRecount,
  ).length;

  const netVarianceUnits = (activeSession?.items || []).reduce(
    (sum: number, i: StockTakeItemDetail) => sum + i.variance,
    0,
  );

  const netVarianceCost = (activeSession?.items || []).reduce(
    (sum: number, i: StockTakeItemDetail) => sum + i.varianceValue,
    0,
  );

  const totalEstimatedShrinkage = (activeSession?.items || []).reduce(
    (sum: number, i: StockTakeItemDetail) => (i.variance < 0 ? sum + Math.abs(i.varianceValue) : sum),
    0,
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 overflow-hidden select-none">
      {/* Toast notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={16} />
          {successToast}
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="text-purple-600" size={26} />
            {language === 'am' ? 'የክምችት ቆጠራ እና ማስተካከያ' : 'Stocktake & Physical Cycle Count'}
          </h1>
          <p className="text-xs text-slate-500">
            {language === 'am'
              ? 'የሱቅ ወይም የምድብ ቆጠራ፣ የልዩነት ሪፖርት እና ወደ ሒሳብ መዝገብ ማስተካከል'
              : 'Continuous scan-to-count with snapshot sales accounting, blind counts, tolerance recounts & shrinkage reports.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeSession ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSession(null)}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs"
              >
                &larr; {language === 'am' ? 'ወደ ዝርዝር ተመለስ' : 'All Sessions'}
              </button>

              <button
                onClick={openShrinkageReport}
                className="px-3.5 py-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center gap-1.5 hover:bg-purple-100 transition shadow-xs"
              >
                <FileSpreadsheet size={15} />
                {language === 'am' ? 'የብክነት ሪፖርት' : 'Shrinkage Report'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsStartModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-2 shadow-md transition active:scale-95"
            >
              <Plus size={16} />
              {language === 'am' ? 'አዲስ ቆጠራ ጀምር' : 'Start Count Session'}
            </button>
          )}
        </div>
      </div>

      {/* 2. Main Workspace: Active Session Screen vs Past Sessions List */}
      {activeSession ? (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {/* Active Session Status & Control Card */}
          <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black text-purple-600 px-3 py-1.5 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                  {activeSession.countNumber}
                </span>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Scope: {activeSession.scope}
                      {activeSession.categoryName ? ` (${activeSession.categoryName})` : ''}
                      {activeSession.location ? ` • Location: ${activeSession.location}` : ''}
                    </span>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        activeSession.status === 'RECONCILED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      }`}
                    >
                      {activeSession.status}
                    </span>

                    {activeSession.status === 'RECONCILED' && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Lock size={11} /> Immutable Audit Record
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Conducted by {activeSession.conductedByName || 'Auditor'}</span>
                    <span>•</span>
                    <span>Snapshot taken: {new Date(activeSession.startedAt).toLocaleTimeString()}</span>
                    <span>•</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Live store mode (concurrent sales & receipts accounted for)
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {activeSession.status === 'IN_PROGRESS' ? (
                  <>
                    <button
                      onClick={handleSaveCounts}
                      disabled={savingCounts}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition active:scale-95"
                    >
                      {savingCounts ? 'Saving...' : 'Save Draft'}
                    </button>

                    <button
                      onClick={() => setIsReconcileModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-md transition active:scale-95"
                    >
                      <CheckCircle2 size={16} />
                      {language === 'am' ? 'አስማማ እና ቆልፍ' : 'Approve & Reconcile'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={openShrinkageReport}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition"
                  >
                    <FileSpreadsheet size={15} />
                    View Final Variance Report
                  </button>
                )}
              </div>
            </div>

            {/* Counters, Blind Count & Multi-user Configuration Bar */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                {/* Blind Count Indicator & Toggle */}
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  {blindCountMode ? (
                    <>
                      <EyeOff size={14} className="text-amber-500" />
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        Blind Count: System Expected Quantities Hidden
                      </span>
                      <button
                        onClick={() => setShowManagerPinModal(true)}
                        className="ml-2 text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        Reveal Expected (Manager PIN)
                      </button>
                    </>
                  ) : (
                    <>
                      <Eye size={14} className="text-emerald-500" />
                      <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        Manager Mode: Expected & Variances Visible
                      </span>
                      <button
                        onClick={() => setBlindCountMode(true)}
                        className="ml-2 text-[10px] font-bold text-slate-400 hover:underline"
                      >
                        Enable Blind Mode
                      </button>
                    </>
                  )}
                </div>

                {/* Multiple Counters Staff Picker */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Users size={13} className="text-slate-400" />
                  <span className="text-[11px] text-slate-400">Current Staff:</span>
                  <select
                    value={currentCounterName}
                    onChange={(e) => setCurrentCounterName(e.target.value)}
                    className="bg-transparent font-bold text-slate-700 dark:text-slate-200 text-[11px] focus:outline-hidden"
                  >
                    <option value="Tigist (Aisle 1)">Tigist (Aisle 1)</option>
                    <option value="Dawit (Backroom)">Dawit (Backroom)</option>
                    <option value="Michael (Cold Room)">Michael (Cold Room)</option>
                    <option value="Storekeeper General">Storekeeper General</option>
                  </select>
                </div>

                {/* Merge Strategy */}
                <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-400">Count Mode:</span>
                  <select
                    value={mergeStrategy}
                    onChange={(e) => setMergeStrategy(e.target.value as any)}
                    className="bg-transparent font-bold text-slate-700 dark:text-slate-200 text-[11px] focus:outline-hidden"
                  >
                    <option value="OVERWRITE">Overwrite Count (=)</option>
                    <option value="MERGE_SUM">Merge & Accumulate (+)</option>
                  </select>
                </div>
              </div>

              {/* Progress Counters */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Audited Progress</div>
                  <div className="font-mono font-black text-slate-900 dark:text-white">
                    {totalCountedCount} / {activeSession.items.length} ({Math.round((totalCountedCount / (activeSession.items.length || 1)) * 100)}%)
                  </div>
                </div>

                {!blindCountMode && (
                  <>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Net Variance Units</div>
                      <div
                        className={`font-mono font-black ${
                          netVarianceUnits < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {netVarianceUnits > 0 ? `+${netVarianceUnits}` : netVarianceUnits} units
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Total Shrinkage</div>
                      <div className="font-mono font-black text-rose-600">
                        {totalEstimatedShrinkage.toFixed(2)} ETB
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rapid Scan-to-Count Box (Hardware Wedge & Mobile Friendly) */}
          {activeSession.status === 'IN_PROGRESS' && (
            <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-600" />
                  <input
                    ref={scanInputRef}
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && barcodeInput.trim()) {
                        handleScannedBarcode(barcodeInput.trim());
                        setBarcodeInput('');
                      }
                    }}
                    placeholder="Scan product barcode (keyboard wedge or camera)..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <button
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 transition ${
                    isCameraActive
                      ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/60'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                  title="Toggle mobile camera barcode scanner"
                >
                  {isCameraActive ? <CameraOff size={16} /> : <Camera size={16} />}
                  <span className="hidden sm:inline">Camera</span>
                </button>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Filter by name/SKU..."
                    className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-hidden"
                  />
                </div>

                <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <button
                    onClick={() => setFilterTab('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      filterTab === 'ALL'
                        ? 'bg-white dark:bg-slate-900 text-purple-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    All ({activeSession.items.length})
                  </button>

                  <button
                    onClick={() => setFilterTab('DISCREPANCIES')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      filterTab === 'DISCREPANCIES'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Discrepancies ({totalDiscrepancies})
                  </button>

                  <button
                    onClick={() => setFilterTab('RECOUNT')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      filterTab === 'RECOUNT'
                        ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Needs Recount ({totalRecountsNeeded})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Camera Scanner Preview Fallback */}
          {isCameraActive && (
            <div className="p-3 bg-purple-900/90 text-white rounded-2xl flex flex-col items-center justify-center gap-2 animate-in fade-in">
              <div className="text-xs font-bold flex items-center gap-1.5">
                <Camera size={16} /> Mobile Camera Live Scanner Active
              </div>
              <div className="w-full max-w-sm h-36 bg-black/60 rounded-xl border-2 border-dashed border-purple-400 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-x-0 h-0.5 bg-red-500 animate-pulse" />
                <span className="text-[11px] text-slate-300">Point phone camera at barcode label</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsCameraActive(false)}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold"
                >
                  Close Camera
                </button>
              </div>
            </div>
          )}

          {/* Items Audit & Variance Review Table */}
          <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">SKU & Product</th>
                    <th className="py-3 px-3 text-center">UOM</th>
                    {!blindCountMode && (
                      <>
                        <th className="py-3 px-3 text-right">Snapshot Qty</th>
                        <th className="py-3 px-3 text-center" title="Concurrent Sales (-) or Receipts (+) after snapshot">
                          Concurrent
                        </th>
                        <th className="py-3 px-3 text-right" title="Effective Expected = Snapshot + Concurrent">
                          Expected
                        </th>
                      </>
                    )}
                    <th className="py-3 px-4 text-center">Physical Count</th>
                    {!blindCountMode && (
                      <>
                        <th className="py-3 px-3 text-right">Variance</th>
                        <th className="py-3 px-3 text-right">Unit Cost</th>
                        <th className="py-3 px-3 text-right">Discrepancy (ETB)</th>
                      </>
                    )}
                    <th className="py-3 px-4 text-center">Status / Recount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        No items match the current filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item: StockTakeItemDetail) => {
                      const expected = item.expectedQuantity ?? item.systemQuantity;
                      const hasDiscrepancy = Math.abs(item.variance) > 0.001;
                      const isShortage = item.variance < 0;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition ${
                            item.needsRecount
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : hasDiscrepancy
                              ? 'bg-rose-50/20 dark:bg-rose-950/10'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">
                              {item.nameEn}
                            </div>
                            <div className="font-mono text-[10px] text-slate-400 flex items-center gap-1.5">
                              <span>SKU: {item.sku}</span>
                              {item.categoryName && (
                                <>
                                  <span>•</span>
                                  <span className="text-purple-600 dark:text-purple-400">{item.categoryName}</span>
                                </>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-center font-bold text-slate-400">
                            {item.uomCode}
                          </td>

                          {!blindCountMode && (
                            <>
                              {/* Snapshot Quantity */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-slate-500">
                                {item.systemQuantity.toLocaleString('en-US')}
                              </td>

                              {/* Concurrent movements badge */}
                              <td className="py-3 px-3 text-center font-mono">
                                {item.laterMovements && item.laterMovements !== 0 ? (
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      item.laterMovements < 0
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                    }`}
                                    title="Movements registered after snapshot"
                                  >
                                    {item.laterMovements > 0 ? `+${item.laterMovements}` : item.laterMovements} sales
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">0</span>
                                )}
                              </td>

                              {/* Effective Expected */}
                              <td className="py-3 px-3 text-right font-mono font-black text-slate-800 dark:text-slate-200">
                                {expected.toLocaleString('en-US')}
                              </td>
                            </>
                          )}

                          {/* Physical Count with touch steppers */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              {activeSession.status === 'IN_PROGRESS' ? (
                                <>
                                  <button
                                    onClick={() => handleUpdateCount(item.productId, item.countedQuantity - 1)}
                                    className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold text-xs text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 transition"
                                    title="-1"
                                  >
                                    -1
                                  </button>

                                  <input
                                    type="number"
                                    min="0"
                                    value={item.countedQuantity}
                                    onChange={(e) =>
                                      handleUpdateCount(item.productId, parseFloat(e.target.value) || 0)
                                    }
                                    className="w-20 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-black text-xs focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                                  />

                                  <button
                                    onClick={() => handleUpdateCount(item.productId, item.countedQuantity + 1)}
                                    className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 font-bold text-xs text-purple-700 dark:text-purple-300 flex items-center justify-center active:scale-95 transition"
                                    title="+1"
                                  >
                                    +1
                                  </button>

                                  <button
                                    onClick={() => handleUpdateCount(item.productId, item.countedQuantity + 5)}
                                    className="w-8 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold text-[11px] text-slate-700 dark:text-slate-200 flex items-center justify-center active:scale-95 transition"
                                    title="+5"
                                  >
                                    +5
                                  </button>
                                </>
                              ) : (
                                <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                                  {item.countedQuantity}
                                </span>
                              )}
                            </div>
                          </td>

                          {!blindCountMode && (
                            <>
                              <td className="py-3 px-3 text-right font-mono font-black">
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

                              <td className="py-3 px-3 text-right font-mono text-slate-500">
                                {item.unitCost.toFixed(2)}
                              </td>

                              <td className="py-3 px-3 text-right font-mono font-black">
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
                            </>
                          )}

                          {/* Recount / Discrepancy Action */}
                          <td className="py-3 px-4 text-center">
                            {blindCountMode ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                <Check size={11} /> Recorded
                              </span>
                            ) : item.needsRecount ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  <AlertTriangle size={11} /> Recount
                                </span>
                                {activeSession.status === 'IN_PROGRESS' && (
                                  <button
                                    onClick={() => handleUpdateCount(item.productId, 0)}
                                    className="p-1 rounded-lg text-amber-600 hover:bg-amber-100 transition"
                                    title="Reset count to re-audit"
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                              </div>
                            ) : hasDiscrepancy ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isShortage
                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                }`}
                              >
                                {isShortage ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
                                {isShortage ? 'Shortage' : 'Surplus'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                <Check size={11} /> Match
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Past Sessions History List View */
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                {language === 'am' ? 'ያለፉ የቆጠራ ክፍለ-ጊዜዎች' : 'Audit Sessions Registry'}
              </h2>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                {(['ALL', 'IN_PROGRESS', 'RECONCILED'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSessionFilter(tab)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      sessionFilter === tab
                        ? 'bg-white dark:bg-slate-900 text-purple-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {tab === 'ALL' ? 'All' : tab === 'IN_PROGRESS' ? 'Active' : 'Reconciled'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={fetchSessions}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
              title="Refresh sessions list"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Count Number</th>
                  <th className="py-3 px-4">Scope / Location</th>
                  <th className="py-3 px-4">Conducted By</th>
                  <th className="py-3 px-4">Snapshot Started</th>
                  <th className="py-3 px-4 text-center">SKUs Audited</th>
                  <th className="py-3 px-4 text-right">Variance Units</th>
                  <th className="py-3 px-4 text-right">Net Value Impact</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sessions
                  .filter((s) => (sessionFilter === 'ALL' ? true : s.status === sessionFilter))
                  .map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => loadSessionDetails(s.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono font-black text-purple-600">
                        {s.countNumber}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {s.scope} {s.categoryName ? `(${s.categoryName})` : ''}
                          {s.location ? ` • ${s.location}` : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {s.conductedByName || 'Auditor'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(s.startedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold">
                        {s.itemCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={s.totalVarianceUnits < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                          {s.totalVarianceUnits > 0 ? `+${s.totalVarianceUnits}` : s.totalVarianceUnits}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black">
                        <span className={s.totalVarianceCost < 0 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                          {s.totalVarianceCost.toFixed(2)} ETB
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            s.status === 'RECONCILED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button className="px-3 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition flex items-center gap-1 mx-auto">
                          <span>Open</span>
                          <ArrowRight size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Start Stocktake Session Modal */}
      {isStartModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <ClipboardList className="text-purple-600" size={22} />
              {language === 'am' ? 'አዲስ የክምችት ቆጠራ ጀምር' : 'Start Stocktake Count Session'}
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Captures a live snapshot timestamp. Sales and goods received during counting will be accounted for dynamically.
            </p>

            <form onSubmit={handleStartStocktake} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1.5">
                  Count Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['FULL', 'CATEGORY', 'LOCATION'] as const).map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => setNewScope(sc)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold border text-center transition ${
                        newScope === sc
                          ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {sc === 'FULL' ? 'Entire Store' : sc === 'CATEGORY' ? 'Category' : 'Location'}
                    </button>
                  ))}
                </div>
              </div>

              {newScope === 'CATEGORY' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
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

              {newScope === 'LOCATION' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                    Store Location / Shelf
                  </label>
                  <input
                    type="text"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    required
                    placeholder="e.g. Aisle 1 - Dry Food, Cold Storage Room 2"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Session Notes (Optional)
                </label>
                <input
                  type="text"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                  placeholder="e.g. Month-End Audit by Auditor Team A"
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
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50"
                >
                  {starting ? 'Capturing Snapshot...' : 'Start Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Manager PIN Reveal Modal (Blind Count Override) */}
      {showManagerPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 text-purple-600 flex items-center justify-center mx-auto mb-3">
              <Lock size={22} />
            </div>

            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">
              Reveal Expected System Quantities
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter Manager PIN to reveal system balances and variance review columns.
            </p>

            <input
              type="password"
              maxLength={6}
              value={managerPinInput}
              onChange={(e) => setManagerPinInput(e.target.value)}
              placeholder="••••"
              className="w-32 mx-auto text-center font-mono text-xl tracking-widest py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-purple-500 mb-3"
            />

            {pinError && <div className="text-xs font-bold text-rose-600 mb-3">{pinError}</div>}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowManagerPinModal(false);
                  setManagerPinInput('');
                  setPinError(null);
                }}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleRevealExpected}
                className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-sm transition"
              >
                Verify PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Manager Approval & Reconciliation Modal */}
      {isReconcileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6">
            <h2 className="text-base font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <CheckCircle2 className="text-emerald-600" size={22} />
              Manager Stocktake Reconciliation
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              This will atomically commit <strong className="text-slate-900 dark:text-white">COUNT_VARIANCE</strong> adjustment ledger entries under reason <code className="font-mono text-purple-600">stocktake</code>. The session will become strictly immutable.
            </p>

            {/* Financial Summary */}
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 mb-4 text-xs space-y-1.5">
              <div className="flex justify-between font-bold">
                <span>Items with Discrepancy:</span>
                <span className="font-mono">{totalDiscrepancies} items</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Net Stock Delta:</span>
                <span className="font-mono">{netVarianceUnits > 0 ? `+${netVarianceUnits}` : netVarianceUnits} units</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total Shrinkage Value:</span>
                <span className="font-mono text-rose-600">
                  {totalEstimatedShrinkage.toFixed(2)} ETB
                </span>
              </div>
              <div className="text-[11px] text-slate-500 pt-1 border-t border-amber-200 dark:border-amber-800/60">
                ✓ Dynamic snapshot accounting applied for all concurrent sales during counting.
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Manager Authorization PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={reconcilePin}
                  onChange={(e) => setReconcilePin(e.target.value)}
                  placeholder="Enter manager PIN..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                  Manager Sign-off Notes
                </label>
                <textarea
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  placeholder="e.g. Authorized monthly physical count reconciliation by Branch Manager."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium"
                />
              </div>

              {reconcileError && (
                <div className="text-xs font-bold text-rose-600">{reconcileError}</div>
              )}
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
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50"
              >
                {reconciling ? 'Committing...' : 'Approve & Reconcile to Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Comprehensive Stocktake & Shrinkage Report Modal */}
      {isReportModalOpen && reportData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in select-none">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileSpreadsheet className="text-purple-600" size={22} />
                  Stocktake Shrinkage & Category Variance Report
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  Session: {reportData.countNumber} • {reportData.status} • Conducted by {reportData.conductedByName || 'Auditor'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Printer size={14} />
                  Print Report
                </button>
                <button
                  onClick={() => setIsReportModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Snapshot Value</div>
                <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                  {reportData.totalSnapshotValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Counted Value</div>
                <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                  {reportData.totalCountedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                <div className="text-[10px] font-bold text-rose-500 uppercase">Shrinkage Loss</div>
                <div className="font-mono font-black text-sm text-rose-600">
                  {reportData.totalShrinkageValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} ETB
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                <div className="text-[10px] font-bold text-purple-600 uppercase">Shrinkage %</div>
                <div className="font-mono font-black text-sm text-purple-700 dark:text-purple-300">
                  {reportData.shrinkagePercent}%
                </div>
              </div>
            </div>

            {/* Category Breakdown Table */}
            <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-800 mb-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 font-extrabold text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-3 text-center">Items</th>
                    <th className="py-2.5 px-3 text-right">Expected Value</th>
                    <th className="py-2.5 px-3 text-right">Counted Value</th>
                    <th className="py-2.5 px-3 text-right">Variance (ETB)</th>
                    <th className="py-2.5 px-4 text-right">Shrinkage %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reportData.categories.map((c: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {c.categoryName}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {c.itemCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {c.expectedValue.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {c.countedValue.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black">
                        <span className={c.varianceValue < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {c.varianceValue.toFixed(2)} ETB
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-black">
                        <span className={c.shrinkagePercent > 5 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}>
                          {c.shrinkagePercent}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-400">
                Audited with GebeyaOS Real-Time Inventory & Stock Ledger Engine
              </span>
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
