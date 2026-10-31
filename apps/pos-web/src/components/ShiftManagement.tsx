import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  FileText,
  ArrowDownCircle,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
  Lock,
  Printer,
  RefreshCw,
  Coins,
  DollarSign,
  Layers,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import {
  posApi,
  XReportData,
  CashMovementRecord,
  CloseShiftPayload,
} from '../utils/pos-api';
import { Shift, HeldBasketRecord } from '@gebeyaos/shared-types';
import { NumberPad, Modal, Button, Badge } from './ui';

const ETH_DENOMINATIONS = [200, 100, 50, 10, 5, 1] as const;
type Denomination = (typeof ETH_DENOMINATIONS)[number];
type DenominationCounts = Record<Denomination, number>;

const DEFAULT_DENOMS: DenominationCounts = {
  200: 0,
  100: 0,
  50: 0,
  10: 0,
  5: 0,
  1: 0,
};

const VARIANCE_THRESHOLD = 50.0; // 50 ETB configurable threshold

export const ShiftManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const { t, formatCurrency } = useI18n();

  // Cashier & Terminal identity
  const terminalId = '018e0000-0000-7000-8000-000000000010';
  const terminalCode = 'POS-01';
  const branchId = currentUser?.branchId || '018e0000-0000-7000-8000-000000000020';
  const branchName = currentUser?.branchName || 'Bole Medhanialem Branch';
  const cashierName = currentUser?.fullName || 'Cashier';
  const cashierId = currentUser?.id || '018e0000-0000-7000-8000-000000000042';
  const userRole = currentUser?.role || 'CASHIER';

  // Live Shift State
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [xReport, setXReport] = useState<XReportData | null>(null);
  const [cashDrops, setCashDrops] = useState<CashMovementRecord[]>([]);
  const [heldBaskets, setHeldBaskets] = useState<HeldBasketRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState<boolean>(false);
  const [isDropModalOpen, setIsDropModalOpen] = useState<boolean>(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState<boolean>(false);
  const [isZReportModalOpen, setIsZReportModalOpen] = useState<boolean>(false);
  const [zReportData, setZReportData] = useState<any | null>(null);

  // Open Shift Form State
  const [openDenoms, setOpenDenoms] = useState<DenominationCounts>({ ...DEFAULT_DENOMS, 100: 10 }); // Default 1000 ETB
  const [openActiveDenom, setOpenActiveDenom] = useState<Denomination>(100);
  const [openNotes, setOpenNotes] = useState<string>('Standard morning register float');
  const [isOpenSubmitting, setIsOpenSubmitting] = useState<boolean>(false);

  // Safe Drop Form State
  const [dropMode, setDropMode] = useState<'denoms' | 'quick'>('quick');
  const [dropAmountStr, setDropAmountStr] = useState<string>('2000');
  const [dropDenoms, setDropDenoms] = useState<DenominationCounts>({ ...DEFAULT_DENOMS, 200: 10 });
  const [dropActiveDenom, setDropActiveDenom] = useState<Denomination>(200);
  const [dropReason, setDropReason] = useState<string>('Midday safe transfer to back office');
  const [dropManagerPin, setDropManagerPin] = useState<string>('');
  const [dropAuthorizer, setDropAuthorizer] = useState<{ id: string; name: string } | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [isDropSubmitting, setIsDropSubmitting] = useState<boolean>(false);

  // Close Shift Guided Steps State
  const [closeStep, setCloseStep] = useState<'prereq' | 'count' | 'reconcile'>('prereq');
  const [closeDenoms, setCloseDenoms] = useState<DenominationCounts>({ ...DEFAULT_DENOMS });
  const [closeActiveDenom, setCloseActiveDenom] = useState<Denomination>(200);
  const [closeNotes, setCloseNotes] = useState<string>('End of shift drawer reconciliation');
  const [submittedPhysicalCash, setSubmittedPhysicalCash] = useState<number>(0);
  const [closeManagerPin, setCloseManagerPin] = useState<string>('');
  const [closeAuthorizer, setCloseAuthorizer] = useState<{ id: string; name: string } | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [isCloseSubmitting, setIsCloseSubmitting] = useState<boolean>(false);

  // Elapsed Shift Duration Timer
  const [elapsedTime, setElapsedTime] = useState<string>('0h 0m');

  const calculateDenomTotal = (denoms: DenominationCounts): number => {
    return ETH_DENOMINATIONS.reduce((sum, d) => sum + denoms[d] * d, 0);
  };

  const openFloatTotal = useMemo(() => calculateDenomTotal(openDenoms), [openDenoms]);
  const dropDenomsTotal = useMemo(() => calculateDenomTotal(dropDenoms), [dropDenoms]);
  const closeDenomsTotal = useMemo(() => calculateDenomTotal(closeDenoms), [closeDenoms]);

  const effectiveDropAmount = useMemo(() => {
    if (dropMode === 'denoms') return dropDenomsTotal;
    const val = parseFloat(dropAmountStr);
    return isNaN(val) ? 0 : val;
  }, [dropMode, dropDenomsTotal, dropAmountStr]);

  // Load Shift, X-Report, Held Baskets, and Movements
  const loadShiftData = useCallback(async (showIndicator = true) => {
    if (showIndicator) setIsLoading(true);
    else setIsRefreshing(true);
    setStatusMsg(null);

    try {
      const [shiftResult, held] = await Promise.all([
        posApi.getCurrentShift(terminalId, branchId),
        posApi.getHeldBaskets(branchId, terminalId),
      ]);

      setHeldBaskets(held);

      if (shiftResult.open && shiftResult.shift) {
        setCurrentShift(shiftResult.shift);
        // Query live X-Report and Movements
        const [report, movements] = await Promise.all([
          posApi.getXReport(shiftResult.shift.id, userRole, branchId),
          posApi.getShiftMovements(shiftResult.shift.id, branchId),
        ]);
        setXReport(report);
        setCashDrops(movements.filter((m) => m.movement_type === 'SAFE_DROP'));
      } else {
        setCurrentShift(null);
        setXReport(null);
        setCashDrops([]);
      }
    } catch (err: any) {
      console.error('Failed to load shift data:', err);
      setStatusMsg({ type: 'error', text: err.message || 'Failed to sync shift data' });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [branchId, terminalId, userRole]);

  useEffect(() => {
    loadShiftData(true);
  }, [loadShiftData]);

  // Update live elapsed time every minute
  useEffect(() => {
    if (!currentShift?.openedAt) return;
    const updateElapsed = () => {
      const start = new Date(currentShift.openedAt).getTime();
      const diffMs = Math.max(0, Date.now() - start);
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      setElapsedTime(`${hours}h ${mins}m`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 60000);
    return () => clearInterval(interval);
  }, [currentShift?.openedAt]);

  // -------------------------------------------------------------
  // OPEN SHIFT ACTION
  // -------------------------------------------------------------
  const handleOpenShiftSubmit = async () => {
    if (openFloatTotal <= 0) {
      alert('Opening float count must be greater than 0 ETB.');
      return;
    }

    setIsOpenSubmitting(true);
    try {
      await posApi.openShift(branchId, terminalId, cashierId, openFloatTotal, openNotes);
      setIsOpenShiftModalOpen(false);
      setStatusMsg({ type: 'success', text: `Shift successfully opened with ETB ${openFloatTotal.toLocaleString()} float.` });
      await loadShiftData(false);
    } catch (err: any) {
      alert(err.message || 'Failed to open shift');
    } finally {
      setIsOpenSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // SAFE DROP ACTION
  // -------------------------------------------------------------
  const handleVerifyDropManagerPin = async (pin: string) => {
    setDropError(null);
    try {
      const res = await posApi.verifyManagerPin(branchId, {
        pin,
        actionRequired: 'SAFE_DROP',
      });
      if (res.authorized) {
        setDropAuthorizer({
          id: res.authorizedBy || '018e0000-0000-7000-8000-000000000041',
          name: res.role ? `${res.role} (Supervisor)` : 'Authorized Manager',
        });
        setDropError(null);
      } else {
        setDropError(res.message || 'Invalid manager PIN');
      }
    } catch (err: any) {
      setDropError(err.message || 'Manager authorization failed');
    }
  };

  const handleRecordSafeDrop = async () => {
    if (!currentShift) return;
    if (effectiveDropAmount <= 0) {
      setDropError('Please specify a positive safe drop amount.');
      return;
    }

    // Large amount threshold rule: >= 2,000 ETB requires manager authorizer
    if (effectiveDropAmount >= 2000.0 && !dropAuthorizer) {
      setDropError('Safe drops of 2,000 ETB or more require manager authorization PIN.');
      return;
    }

    setIsDropSubmitting(true);
    setDropError(null);
    try {
      await posApi.recordCashMovement(currentShift.id, cashierId, branchId, {
        movement_type: 'SAFE_DROP',
        amount: effectiveDropAmount,
        reason: dropReason,
        authorized_by: dropAuthorizer?.id || cashierId,
        manager_pin: dropManagerPin || undefined,
      });

      setIsDropModalOpen(false);
      setDropAuthorizer(null);
      setDropManagerPin('');
      setStatusMsg({
        type: 'success',
        text: `Safe drop of ETB ${effectiveDropAmount.toLocaleString()} transferred to vault.`,
      });
      await loadShiftData(false);
    } catch (err: any) {
      setDropError(err.message || 'Failed to record safe drop');
    } finally {
      setIsDropSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // CLOSE SHIFT GUIDED FLOW
  // -------------------------------------------------------------
  const startCloseShiftFlow = () => {
    setCloseStep('prereq');
    setCloseDenoms({ ...DEFAULT_DENOMS });
    setCloseActiveDenom(200);
    setSubmittedPhysicalCash(0);
    setCloseAuthorizer(null);
    setCloseManagerPin('');
    setCloseError(null);
    setIsCloseModalOpen(true);
  };

  const handleVerifyCloseManagerPin = async (pin: string) => {
    setCloseError(null);
    try {
      const res = await posApi.verifyManagerPin(branchId, {
        pin,
        actionRequired: 'SHIFT_CLOSE_VARIANCE',
      });
      if (res.authorized) {
        setCloseAuthorizer({
          id: res.authorizedBy || '018e0000-0000-7000-8000-000000000041',
          name: res.role ? `${res.role} (Supervisor)` : 'Authorized Manager',
        });
        setCloseError(null);
      } else {
        setCloseError(res.message || 'Invalid manager PIN');
      }
    } catch (err: any) {
      setCloseError(err.message || 'Manager verification failed');
    }
  };

  const handleSubmitPhysicalCount = async () => {
    if (closeDenomsTotal < 0) {
      setCloseError('Please complete the physical cash count.');
      return;
    }

    setSubmittedPhysicalCash(closeDenomsTotal);
    setCloseStep('reconcile');
    setCloseError(null);
  };

  const handleFinalizeCloseShift = async () => {
    if (!currentShift) return;

    // Check variance approval if > 50 ETB
    const systemExpected = xReport?.expected_cash ?? 0;
    const variance = submittedPhysicalCash - systemExpected;
    const isExceeded = Math.abs(variance) > VARIANCE_THRESHOLD;

    if (isExceeded && !closeAuthorizer) {
      setCloseError(
        `Variance of ${Math.abs(variance).toFixed(2)} ETB exceeds threshold of ${VARIANCE_THRESHOLD} ETB. Manager approval PIN is required.`,
      );
      return;
    }

    setIsCloseSubmitting(true);
    setCloseError(null);
    try {
      const payload: CloseShiftPayload = {
        closing_cash_counted: submittedPhysicalCash,
        notes: closeNotes,
        authorized_by: closeAuthorizer?.id || undefined,
        manager_pin: closeManagerPin || undefined,
      };

      const closedShiftResult = await posApi.closeShift(
        currentShift.id,
        cashierId,
        branchId,
        payload,
      );

      setIsCloseModalOpen(false);
      setZReportData({
        shiftNumber: currentShift.shiftNumber,
        shiftId: currentShift.id,
        terminalCode,
        cashierName,
        openedAt: currentShift.openedAt,
        closedAt: new Date().toISOString(),
        openingFloat: xReport?.opening_float || currentShift.openingCashFloat,
        grossSales: xReport?.gross_sales_amount || 0,
        cashSales: xReport?.cash_sales_amount || 0,
        telebirrSales: xReport?.telebirr_sales_amount || 0,
        cbeBirrSales: xReport?.cbe_birr_sales_amount || 0,
        cardSales: xReport?.card_sales_amount || 0,
        totalRefunds: xReport?.total_refunds || 0,
        totalDrops: xReport?.total_cash_drops || 0,
        expectedCash: systemExpected,
        countedCash: submittedPhysicalCash,
        variance,
        authorizedBy: closeAuthorizer?.name || null,
        denominations: closeDenoms,
      });
      setIsZReportModalOpen(true);
      await loadShiftData(false);
    } catch (err: any) {
      setCloseError(err.message || 'Failed to close shift');
    } finally {
      setIsCloseSubmitting(false);
    }
  };

  // Printable Z-Report formatting
  const handlePrintZReport = () => {
    window.print();
  };

  const fmt = (n: number) =>
    n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="page-container select-none">
      {/* ─── Header & Status Badge ─── */}
      <div className="page-header flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title text-2xl font-black text-text-main">
              {t('shiftTab')} · Cashier Shift
            </h1>
            {currentShift ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Shift #{currentShift.shiftNumber}: OPEN ({elapsedTime})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-danger/10 text-danger border border-danger/30">
                <span className="w-2 h-2 rounded-full bg-danger" />
                Shift: CLOSED
              </span>
            )}
          </div>
          <p className="page-subtitle text-xs text-text-muted mt-1">
            Terminal: <span className="font-bold text-text-main">{terminalCode}</span> · Branch:{' '}
            <span className="font-semibold">{branchName}</span> · Cashier:{' '}
            <span className="font-bold text-primary">{cashierName}</span> ({userRole})
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => loadShiftData(false)}
            disabled={isRefreshing}
            className="btn-secondary text-xs px-3 py-2 flex items-center gap-1.5"
            title="Refresh shift totals"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            <span>Sync Live</span>
          </button>

          {!currentShift && (
            <button
              type="button"
              onClick={() => setIsOpenShiftModalOpen(true)}
              className="btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5"
            >
              <Coins size={14} />
              <span>Open Guided Shift</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Status Banner if any */}
      {statusMsg && (
        <div
          className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs font-semibold mt-4 transition-all ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          {statusMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{statusMsg.text}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="ml-auto opacity-70 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Main Content View ─── */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <RefreshCw size={28} className="animate-spin text-primary mb-3" />
          <p className="text-sm font-semibold">Loading live register shift readings...</p>
        </div>
      ) : currentShift && xReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-6">
          {/* ─── Left Column: Interim Shift Reading (X-Report Card) ─── */}
          <div className="lg:col-span-7 glass-panel p-6 flex flex-col justify-between border border-border-subtle rounded-2xl shadow-soft">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-base text-text-main">
                      Interim Shift Reading (X-Report)
                    </h2>
                    <p className="text-xs text-text-muted">
                      Shift #{currentShift.shiftNumber} · Monitored real-time register balance
                    </p>
                  </div>
                </div>
                <Badge variant="neutral" size="sm">
                  Live Snapshot
                </Badge>
              </div>

              {/* Breakdown Rows */}
              <div className="divide-y divide-border-subtle text-sm">
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-text-muted">Opening Cash Float</span>
                  <span className="font-bold tabular-nums text-text-main">
                    ETB {fmt(xReport.opening_float)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2.5 font-bold">
                  <span className="text-text-main">Gross Sales Total ({xReport.total_sales_count} sales)</span>
                  <span className="tabular-nums text-text-main">
                    ETB {fmt(xReport.gross_sales_amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 pl-4 text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                    • Cash Sales (Net of change)
                  </span>
                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    + ETB {fmt(xReport.cash_sales_amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 pl-4 text-xs">
                  <span className="text-text-muted flex items-center gap-1.5">
                    • Telebirr SuperApp Payments
                  </span>
                  <span className="font-bold tabular-nums text-text-main">
                    ETB {fmt(xReport.telebirr_sales_amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 pl-4 text-xs">
                  <span className="text-text-muted flex items-center gap-1.5">
                    • CBE Birr Mobile Banking
                  </span>
                  <span className="font-bold tabular-nums text-text-main">
                    ETB {fmt(xReport.cbe_birr_sales_amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 pl-4 text-xs">
                  <span className="text-text-muted flex items-center gap-1.5">
                    • Card POS Terminal
                  </span>
                  <span className="font-bold tabular-nums text-text-main">
                    ETB {fmt(xReport.card_sales_amount)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2.5">
                  <span className="text-danger flex items-center gap-1">
                    Customer Refunds Given
                  </span>
                  <span className="font-bold tabular-nums text-danger">
                    − ETB {fmt(xReport.total_refunds)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2.5">
                  <span className="text-amber-600 dark:text-amber-400">
                    Safe Drops Transferred to Vault
                  </span>
                  <span className="font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    − ETB {fmt(xReport.total_cash_drops)}
                  </span>
                </div>

                {xReport.total_petty_cash_out > 0 && (
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-danger">Petty Cash Disbursed</span>
                    <span className="font-bold tabular-nums text-danger">
                      − ETB {fmt(xReport.total_petty_cash_out)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Expected Cash in Drawer (Role Protected / Blind Close) */}
            <div className="mt-6 pt-4 border-t border-border-subtle bg-surface-2/60 p-4 rounded-xl border border-border-subtle/50">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs uppercase tracking-wider font-extrabold text-text-muted">
                    Expected Cash in Drawer
                  </span>
                  <p className="text-[11px] text-text-dim mt-0.5">
                    {xReport.is_blind_close
                      ? 'Blind Close Policy: System total hidden from Cashier role until physical count is submitted'
                      : 'Live mathematical balance: float + net cash sales - safe drops - refunds'}
                  </p>
                </div>

                {xReport.is_blind_close ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                    <Lock size={14} />
                    <span>Protected (Blind Close)</span>
                  </span>
                ) : (
                  <span className="text-xl font-black tabular-nums text-primary">
                    ETB {fmt(xReport.expected_cash ?? 0)}
                  </span>
                )}
              </div>
            </div>

            {/* Shift Quick Actions */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                className="btn-primary py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-soft"
                onClick={() => {
                  setDropError(null);
                  setDropAuthorizer(null);
                  setIsDropModalOpen(true);
                }}
              >
                <ArrowDownCircle size={18} />
                <span>Safe Drop</span>
              </button>

              <button
                type="button"
                className="btn-danger py-3 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer shadow-soft"
                onClick={startCloseShiftFlow}
              >
                <Lock size={18} />
                <span>Close Shift (Guided)</span>
              </button>
            </div>
          </div>

          {/* ─── Right Column: Cash Drops & Movements History ─── */}
          <div className="lg:col-span-5 glass-panel p-6 flex flex-col justify-between border border-border-subtle rounded-2xl shadow-soft">
            <div>
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-border-subtle">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <ArrowDownCircle size={20} />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-base text-text-main">
                      Shift Cash Drops ({cashDrops.length})
                    </h2>
                    <p className="text-xs text-text-muted">
                      Mid-shift safe transfers and vault drops
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDropModalOpen(true)}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>New Drop</span>
                </button>
              </div>

              {cashDrops.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
                  <Coins size={36} className="text-text-dim mb-3 opacity-50" />
                  <p className="text-sm font-semibold text-text-main">
                    No safe drops recorded yet this shift
                  </p>
                  <p className="text-xs text-text-dim max-w-xs mt-1">
                    When cash in the drawer exceeds security limits, perform a safe drop to transfer excess funds to the back office safe.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                  {cashDrops.map((d, i) => (
                    <div
                      key={d.id || i}
                      className="flex items-center justify-between p-3.5 rounded-xl bg-surface-2 border border-border-subtle hover:border-border transition-colors"
                    >
                      <div>
                        <div className="text-xs font-bold text-text-main flex items-center gap-1.5">
                          <span>{d.reason}</span>
                          {d.amount >= 2000 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <ShieldCheck size={10} />
                              Authorized
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-dim mt-0.5">
                          {new Date(d.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {d.authorizer_name && ` · Auth: ${d.authorizer_name}`}
                        </div>
                      </div>

                      <span className="text-sm font-black tabular-nums text-amber-600 dark:text-amber-400">
                        − ETB {fmt(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Held Baskets Warning Card if any exist */}
            {heldBaskets.length > 0 && (
              <div className="mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <AlertCircle size={15} />
                  <span>{heldBaskets.length} Active Held Basket(s) on Terminal</span>
                </div>
                <p className="text-[11px] text-text-dim">
                  Must be resumed or voided before shift close is permitted.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── Shift Closed / Empty State ─── */
        <div className="max-w-xl mx-auto mt-12 glass-panel p-8 rounded-2xl border border-border-subtle shadow-soft text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <Coins size={32} />
          </div>
          <h2 className="text-xl font-extrabold text-text-main">
            No Active Cashier Shift on {terminalCode}
          </h2>
          <p className="text-sm text-text-muted mt-2 max-w-md mx-auto">
            Opening a register shift requires counting and recording the physical opening cash float in the drawer. Each terminal permits only one open shift at a time.
          </p>

          <div className="mt-8">
            <button
              type="button"
              className="btn-primary w-full py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2 cursor-pointer shadow-soft"
              onClick={() => setIsOpenShiftModalOpen(true)}
            >
              <Sparkles size={18} />
              <span>Start Guided Opening Shift</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. GUIDED OPEN SHIFT MODAL (DENOMINATIONS & OPENING FLOAT)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isOpenShiftModalOpen}
        onClose={() => setIsOpenShiftModalOpen(false)}
        title="Open New Register Shift · Guided Float Count"
        maxWidth="lg"
      >
        <div className="flex flex-col gap-5 py-2">
          {/* Identity confirmation */}
          <div className="p-3 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between text-xs">
            <div>
              <span className="text-text-dim">Terminal & Lane:</span>{' '}
              <span className="font-bold text-text-main">{terminalCode} ({branchName})</span>
            </div>
            <div>
              <span className="text-text-dim">Cashier:</span>{' '}
              <span className="font-bold text-primary">{cashierName}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-main flex items-center justify-between mb-2">
              <span>Denomination Counter (Ethiopian Birr)</span>
              <span className="text-text-dim">Click denomination to enter via Keypad</span>
            </label>

            {/* Denomination Counter Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {ETH_DENOMINATIONS.map((d) => {
                const count = openDenoms[d];
                const lineTotal = count * d;
                const isSelected = openActiveDenom === d;

                return (
                  <div
                    key={d}
                    onClick={() => setOpenActiveDenom(d)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-primary bg-primary-soft/30 shadow-soft ring-1 ring-primary'
                        : 'border-border-subtle bg-surface hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-black bg-surface-2 text-text-main border border-border-subtle">
                        {d} ETB
                      </span>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        ETB {fmt(lineTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDenoms((prev) => ({ ...prev, [d]: Math.max(0, prev[d] - 1) }));
                        }}
                        className="w-8 h-8 rounded-lg bg-surface-2 hover:bg-surface text-text-muted hover:text-text-main flex items-center justify-center border border-border-subtle active:scale-95 cursor-pointer"
                      >
                        <Minus size={14} />
                      </button>

                      <span className="font-black text-base text-text-main tabular-nums">
                        {count}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDenoms((prev) => ({ ...prev, [d]: prev[d] + 1 }));
                        }}
                        className="w-8 h-8 rounded-lg bg-surface-2 hover:bg-surface text-text-muted hover:text-text-main flex items-center justify-center border border-border-subtle active:scale-95 cursor-pointer"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick presets & Total */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-primary-soft/40 border border-primary/20">
            <div>
              <span className="text-xs font-semibold text-text-muted">Total Calculated Opening Float</span>
              <div className="text-2xl font-black text-primary tabular-nums">
                ETB {fmt(openFloatTotal)}
              </div>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex items-center gap-1.5">
              {[500, 1000, 2000, 5000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const count200 = Math.floor(preset / 200);
                    const rem100 = (preset % 200) / 100;
                    setOpenDenoms({ ...DEFAULT_DENOMS, 200: count200, 100: rem100 });
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-surface hover:bg-surface-2 border border-border-subtle text-text-main active:scale-95 cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text-muted mb-1 block">Shift Opening Notes</label>
            <input
              type="text"
              value={openNotes}
              onChange={(e) => setOpenNotes(e.target.value)}
              placeholder="e.g. Standard morning float checked and counted"
              className="w-full text-xs p-2.5 rounded-xl bg-surface border border-border-subtle text-text-main focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary flex-1 py-3"
              onClick={() => setIsOpenShiftModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex-1 py-3 font-bold"
              disabled={isOpenSubmitting || openFloatTotal <= 0}
              onClick={handleOpenShiftSubmit}
            >
              {isOpenSubmitting ? 'Opening Shift...' : `Confirm Float (ETB ${fmt(openFloatTotal)})`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          2. SAFE DROP MODAL (NUMBER PAD + DENOM COUNTER + AUTHORIZER)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isDropModalOpen}
        onClose={() => setIsDropModalOpen(false)}
        title="Record Mid-Shift Safe Drop"
        maxWidth="md"
      >
        <div className="flex flex-col gap-4 py-2">
          {/* Mode Switcher */}
          <div className="flex p-1 rounded-xl bg-surface-2 border border-border-subtle">
            <button
              type="button"
              onClick={() => setDropMode('quick')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dropMode === 'quick' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'
              }`}
            >
              Quick / NumberPad
            </button>
            <button
              type="button"
              onClick={() => setDropMode('denoms')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                dropMode === 'denoms' ? 'bg-surface text-primary shadow-soft' : 'text-text-muted'
              }`}
            >
              Denomination Breakdown
            </button>
          </div>

          {dropMode === 'quick' ? (
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-surface border border-border-subtle flex items-center justify-between">
                <span className="text-xs font-bold text-text-muted">Amount to Transfer to Vault</span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
                  ETB {fmt(effectiveDropAmount)}
                </span>
              </div>

              {/* NumberPad */}
              <NumberPad
                onDigit={(digit) => {
                  setDropAmountStr((prev) => (prev === '0' ? digit : prev + digit));
                }}
                onClear={() => setDropAmountStr('0')}
                onBackspace={() => {
                  setDropAmountStr((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
                }}
                quickAmounts={[500, 1000, 2000, 3000, 5000]}
                onQuickAmount={(amt) => setDropAmountStr(amt.toString())}
              />
            </div>
          ) : (
            /* Denomination Mode */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ETH_DENOMINATIONS.map((d) => (
                <div
                  key={d}
                  className="p-2.5 rounded-xl border border-border-subtle bg-surface flex flex-col justify-between"
                >
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span>{d} ETB</span>
                    <span className="text-amber-600 tabular-nums">
                      {dropDenoms[d] * d}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <button
                      type="button"
                      onClick={() => setDropDenoms((prev) => ({ ...prev, [d]: Math.max(0, prev[d] - 1) }))}
                      className="w-7 h-7 rounded bg-surface-2 flex items-center justify-center cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-bold text-sm tabular-nums">{dropDenoms[d]}</span>
                    <button
                      type="button"
                      onClick={() => setDropDenoms((prev) => ({ ...prev, [d]: prev[d] + 1 }))}
                      className="w-7 h-7 rounded bg-surface-2 flex items-center justify-center cursor-pointer"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Drop Reason */}
          <div>
            <label className="text-xs font-bold text-text-muted mb-1 block">Drop Reason</label>
            <select
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              className="w-full text-xs p-2.5 rounded-xl bg-surface border border-border-subtle text-text-main focus:border-primary focus:outline-none"
            >
              <option value="Midday safe transfer to back office">Midday safe transfer to back office</option>
              <option value="High cash in drawer limit reached (> 5,000 ETB)">High cash in drawer limit reached</option>
              <option value="End of morning rush deposit">End of morning rush deposit</option>
              <option value="Shift changeover safe deposit">Shift changeover safe deposit</option>
            </select>
          </div>

          {/* Manager Authorization Prompt for Large Amounts (>= 2,000 ETB) */}
          {effectiveDropAmount >= 2000.0 && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-2 text-xs font-bold mb-1.5">
                <ShieldAlert size={16} />
                <span>Manager Authorization Required (≥ 2,000 ETB)</span>
              </div>
              <p className="text-[11px] text-text-dim mb-3">
                Ethiopian financial internal control requires supervisor sign-off for safe drops exceeding 2,000 ETB.
              </p>

              {dropAuthorizer ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                  <span>✓ {dropAuthorizer.name}</span>
                  <button
                    type="button"
                    onClick={() => setDropAuthorizer(null)}
                    className="text-[11px] underline opacity-80 hover:opacity-100"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="password"
                    maxLength={6}
                    value={dropManagerPin}
                    onChange={(e) => setDropManagerPin(e.target.value)}
                    placeholder="Enter Supervisor PIN (e.g. 1234)"
                    className="flex-1 text-xs p-2 rounded-lg bg-surface border border-border-subtle text-text-main focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleVerifyDropManagerPin(dropManagerPin)}
                    className="btn-primary text-xs px-3 py-2 font-bold"
                  >
                    Verify
                  </button>
                </div>
              )}
            </div>
          )}

          {dropError && (
            <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{dropError}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary flex-1 py-3"
              onClick={() => setIsDropModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary flex-1 py-3 font-bold"
              disabled={
                isDropSubmitting ||
                effectiveDropAmount <= 0 ||
                (effectiveDropAmount >= 2000.0 && !dropAuthorizer)
              }
              onClick={handleRecordSafeDrop}
            >
              {isDropSubmitting ? 'Recording Drop...' : `Transfer ETB ${fmt(effectiveDropAmount)} to Safe`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          3. GUIDED CLOSE SHIFT MODAL (STEP-BY-STEP BLIND CLOSE)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title="Guided Register Shift Closure"
        maxWidth="lg"
      >
        <div className="flex flex-col gap-5 py-2">
          {/* Step Indicator */}
          <div className="flex items-center justify-between border-b border-border-subtle pb-3">
            {[
              { id: 'prereq', label: '1. Prerequisites' },
              { id: 'count', label: '2. Blind Count' },
              { id: 'reconcile', label: '3. Variance Approval' },
            ].map((s) => {
              const isActive = closeStep === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-1.5 text-xs font-bold ${
                    isActive ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                      isActive ? 'bg-primary text-white' : 'bg-surface-2 text-text-dim'
                    }`}
                  >
                    {s.label.charAt(0)}
                  </span>
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          {/* ─── Step 1: Pre-Close Prerequisites ─── */}
          {closeStep === 'prereq' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle">
                <h4 className="text-xs font-bold text-text-main mb-3 uppercase tracking-wider">
                  Pre-Close Invariants & Security Checks
                </h4>

                {/* Invariant 1: Held Baskets Check */}
                <div
                  className={`p-3 rounded-xl border flex items-start gap-3 mb-2.5 ${
                    heldBaskets.length > 0
                      ? 'bg-danger/10 border-danger/30 text-danger'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {heldBaskets.length > 0 ? (
                    <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-xs">
                      {heldBaskets.length > 0
                        ? `Cannot Close: ${heldBaskets.length} Active Held Basket(s) on Terminal`
                        : 'No Active Held Baskets on Terminal'}
                    </div>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {heldBaskets.length > 0
                        ? 'All held customer carts must be completed, resumed, or voided before closing the shift to preserve audit integrity.'
                        : 'All checkout baskets have been reconciled. Zero pending transactions.'}
                    </p>
                  </div>
                </div>

                {/* Invariant 2: Terminal Inactive Open Shift Check */}
                <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-start gap-3">
                  <CheckCircle size={20} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-xs">Monotonic Shift Integrity</div>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      Closing Shift #{currentShift?.shiftNumber} on {terminalCode}. Next shift will monotonically advance.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary px-5 py-2.5"
                  onClick={() => setIsCloseModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={heldBaskets.length > 0}
                  onClick={() => setCloseStep('count')}
                  className="btn-primary px-6 py-2.5 font-bold flex items-center gap-1.5"
                >
                  <span>Proceed to Blind Cash Count</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 2: Blind Cash Count (Denominations + Keypad) ─── */}
          {closeStep === 'count' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-primary-soft/40 border border-primary/20 flex items-center gap-3">
                <Lock size={22} className="text-primary flex-shrink-0" />
                <div>
                  <h4 className="text-xs font-black text-text-main">
                    Blind Close Protocol Active
                  </h4>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    System expected cash is strictly hidden. Count all physical cash notes and coins in your drawer below.
                  </p>
                </div>
              </div>

              {/* Denominations Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ETH_DENOMINATIONS.map((d) => {
                  const count = closeDenoms[d];
                  const lineTotal = count * d;
                  const isSelected = closeActiveDenom === d;

                  return (
                    <div
                      key={d}
                      onClick={() => setCloseActiveDenom(d)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'border-primary bg-primary-soft/30 shadow-soft ring-1 ring-primary'
                          : 'border-border-subtle bg-surface hover:border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded text-xs font-black bg-surface-2 text-text-main border border-border-subtle">
                          {d} ETB
                        </span>
                        <span className="text-xs font-bold text-primary tabular-nums">
                          ETB {fmt(lineTotal)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCloseDenoms((prev) => ({ ...prev, [d]: Math.max(0, prev[d] - 1) }));
                          }}
                          className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center border border-border-subtle cursor-pointer active:scale-95"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="font-black text-base tabular-nums text-text-main">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCloseDenoms((prev) => ({ ...prev, [d]: prev[d] + 1 }));
                          }}
                          className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center border border-border-subtle cursor-pointer active:scale-95"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Running Counted Cash Total */}
              <div className="p-3.5 rounded-xl bg-surface border border-border-subtle flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-text-muted">Total Physical Cash Counted</span>
                  <p className="text-[11px] text-text-dim">Calculated from denomination breakdown</p>
                </div>
                <div className="text-2xl font-black text-primary tabular-nums">
                  ETB {fmt(closeDenomsTotal)}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-bold text-text-muted mb-1 block">Closing Remarks</label>
                <input
                  type="text"
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                  placeholder="e.g. Regular close, counted with supervisor"
                  className="w-full text-xs p-2.5 rounded-xl bg-surface border border-border-subtle text-text-main focus:border-primary focus:outline-none"
                />
              </div>

              {closeError && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-semibold">
                  {closeError}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary px-5 py-2.5"
                  onClick={() => setCloseStep('prereq')}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary px-6 py-2.5 font-bold flex items-center gap-1.5"
                  onClick={handleSubmitPhysicalCount}
                >
                  <span>Submit Physical Count & Evaluate</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ─── Step 3: Variance Reconciliation & Manager Approval ─── */}
          {closeStep === 'reconcile' && (
            <div className="flex flex-col gap-4">
              {/* Expected vs Counted Comparison */}
              <div className="p-4 rounded-xl bg-surface border border-border-subtle divide-y divide-border-subtle text-sm">
                <div className="flex justify-between items-center pb-2.5">
                  <span className="text-text-muted">Physical Counted Cash:</span>
                  <span className="font-bold text-text-main tabular-nums">
                    ETB {fmt(submittedPhysicalCash)}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2.5">
                  <span className="text-text-muted">Expected System Cash:</span>
                  <span className="font-bold text-primary tabular-nums">
                    ETB {fmt(xReport?.expected_cash ?? 0)}
                  </span>
                </div>

                {(() => {
                  const expected = xReport?.expected_cash ?? 0;
                  const variance = submittedPhysicalCash - expected;
                  const isExceeded = Math.abs(variance) > VARIANCE_THRESHOLD;

                  return (
                    <div className="pt-2.5">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-text-main">
                          Variance (Over / Short):
                        </span>
                        <span
                          className={`text-lg font-black tabular-nums ${
                            variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'
                          }`}
                        >
                          {variance >= 0 ? '+' : ''}ETB {fmt(variance)}
                        </span>
                      </div>

                      {/* Threshold compliance card */}
                      <div className="mt-3">
                        {!isExceeded ? (
                          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 font-semibold">
                            <CheckCircle size={16} />
                            <span>Variance is within the allowable threshold (≤ 50.00 ETB). Ready to finalize.</span>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs">
                            <div className="flex items-center gap-2 font-bold mb-1">
                              <ShieldAlert size={16} />
                              <span>Variance Exceeds 50.00 ETB Threshold · Manager Approval Required</span>
                            </div>
                            <p className="text-[11px] opacity-90 mb-3">
                              Variance of {Math.abs(variance).toFixed(2)} ETB requires supervisor PIN authorization before this shift can be sealed.
                            </p>

                            {closeAuthorizer ? (
                              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between">
                                <span>✓ Authorized by Manager: {closeAuthorizer.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setCloseAuthorizer(null)}
                                  className="text-[11px] underline opacity-80"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <input
                                  type="password"
                                  maxLength={6}
                                  value={closeManagerPin}
                                  onChange={(e) => setCloseManagerPin(e.target.value)}
                                  placeholder="Enter Supervisor PIN (e.g. 1234)"
                                  className="flex-1 text-xs p-2 rounded-lg bg-surface border border-border-subtle text-text-main focus:border-primary focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleVerifyCloseManagerPin(closeManagerPin)}
                                  className="btn-primary text-xs px-3 py-2 font-bold"
                                >
                                  Authorize
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {closeError && (
                <div className="p-2.5 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs font-semibold">
                  {closeError}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary px-5 py-2.5"
                  onClick={() => setCloseStep('count')}
                >
                  Recount
                </button>
                <button
                  type="button"
                  disabled={
                    isCloseSubmitting ||
                    (Math.abs(submittedPhysicalCash - (xReport?.expected_cash ?? 0)) >
                      VARIANCE_THRESHOLD &&
                      !closeAuthorizer)
                  }
                  onClick={handleFinalizeCloseShift}
                  className="btn-danger px-6 py-2.5 font-bold flex items-center gap-1.5"
                >
                  <Lock size={16} />
                  <span>{isCloseSubmitting ? 'Sealing Shift...' : 'Seal & Emit Z-Report'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          4. IMMUTABLE Z-REPORT MODAL (PRINTABLE & AUDITED)
         ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isZReportModalOpen}
        onClose={() => setIsZReportModalOpen(false)}
        title="Z-Report Generated (Immutable Financial Record)"
        maxWidth="md"
      >
        {zReportData && (
          <div className="flex flex-col gap-4 py-2">
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5">
              <CheckCircle size={20} />
              <div>
                <h4 className="font-extrabold text-xs">
                  Shift #{zReportData.shiftNumber} Sealed and Recorded
                </h4>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Audited to sync outbox event SHIFT_CLOSED. Z-Report numbers are immutable.
                </p>
              </div>
            </div>

            {/* Printable Thermal Receipt Replica */}
            <div className="p-5 rounded-xl bg-surface-2 border border-border-subtle font-mono text-xs leading-relaxed text-text-main shadow-inner">
              <div className="text-center font-bold text-sm mb-1">{branchName.toUpperCase()}</div>
              <div className="text-center text-[11px] text-text-dim mb-3">
                Z-REPORT (DAILY REGISTER CLOSING)
              </div>

              <div className="border-t border-b border-dashed border-border-subtle py-2 mb-3 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between">
                  <span>TERMINAL:</span>
                  <span className="font-bold">{zReportData.terminalCode}</span>
                </div>
                <div className="flex justify-between">
                  <span>SHIFT NO:</span>
                  <span className="font-bold">#{zReportData.shiftNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>CASHIER:</span>
                  <span className="font-bold">{zReportData.cashierName}</span>
                </div>
                <div className="flex justify-between">
                  <span>OPENED:</span>
                  <span>{new Date(zReportData.openedAt).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>CLOSED:</span>
                  <span>{new Date(zReportData.closedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex justify-between">
                  <span>OPENING FLOAT:</span>
                  <span className="font-bold">ETB {fmt(zReportData.openingFloat)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GROSS SALES:</span>
                  <span className="font-bold">ETB {fmt(zReportData.grossSales)}</span>
                </div>
                <div className="flex justify-between pl-3 text-text-dim">
                  <span>• CASH SALES:</span>
                  <span>ETB {fmt(zReportData.cashSales)}</span>
                </div>
                <div className="flex justify-between pl-3 text-text-dim">
                  <span>• TELEBIRR SALES:</span>
                  <span>ETB {fmt(zReportData.telebirrSales)}</span>
                </div>
                <div className="flex justify-between pl-3 text-text-dim">
                  <span>• CARD POS SALES:</span>
                  <span>ETB {fmt(zReportData.cardSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span>TOTAL REFUNDS:</span>
                  <span>− ETB {fmt(zReportData.totalRefunds)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SAFE DROPS:</span>
                  <span>− ETB {fmt(zReportData.totalDrops)}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-border-subtle pt-2 mt-2 flex flex-col gap-1">
                <div className="flex justify-between font-bold">
                  <span>EXPECTED SYSTEM CASH:</span>
                  <span>ETB {fmt(zReportData.expectedCash)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>PHYSICAL COUNTED CASH:</span>
                  <span>ETB {fmt(zReportData.countedCash)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-sm pt-1">
                  <span>VARIANCE (OVER/SHORT):</span>
                  <span
                    className={
                      zReportData.variance >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-danger'
                    }
                  >
                    {zReportData.variance >= 0 ? '+' : ''}ETB {fmt(zReportData.variance)}
                  </span>
                </div>
                {zReportData.authorizedBy && (
                  <div className="text-[10px] text-text-dim mt-1">
                    SUPERVISOR APPROVAL: {zReportData.authorizedBy}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                className="btn-secondary flex-1 py-3 font-bold flex items-center justify-center gap-1.5"
                onClick={handlePrintZReport}
              >
                <Printer size={16} />
                <span>Print Z-Report</span>
              </button>
              <button
                type="button"
                className="btn-primary flex-1 py-3 font-bold"
                onClick={() => setIsZReportModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
