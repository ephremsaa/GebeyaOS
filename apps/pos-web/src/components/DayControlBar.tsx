/**
 * DayControlBar.tsx
 *
 * A compact header strip for the Sales page that replaces the separate Shift page.
 * Shows:
 *   - "Start day" button (no shift open)
 *   - "Day open since HH:MM · Xh Ym" + 24h warning badge (shift open)
 *   - "End day" button that opens the cash-count close flow
 *   - "Put cash in safe" (safe drop) accessible from the End day panel
 *
 * Uses ShiftContext as the SINGLE source of truth — never re-asks if
 * the server already has an open shift.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Sun,
  Moon,
  AlertTriangle,
  Coins,
  CheckCircle2,
  X,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useShift } from '../context/ShiftContext';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { posApi } from '../utils/pos-api';
import { NumberPad } from './ui';

// ── Ethiopian note denominations ──────────────────────────────────────────────
const DENOMS = [200, 100, 50, 10, 5, 1] as const;
type Denom = (typeof DENOMS)[number];
type DenomMap = Record<Denom, number>;
const ZERO_DENOMS: DenomMap = { 200: 0, 100: 0, 50: 0, 10: 0, 5: 0, 1: 0 };
const denomTotal = (d: DenomMap) => DENOMS.reduce((s, k) => s + d[k] * k, 0);

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtElapsed(openedAt: string): string {
  const ms = Math.max(0, Date.now() - new Date(openedAt).getTime());
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function elapsedHours(openedAt: string): number {
  return Math.floor(Math.max(0, Date.now() - new Date(openedAt).getTime()) / 3600000);
}

// ── sub-components ────────────────────────────────────────────────────────────

/** Simple number-only amount input (ETB). */
function FloatInput({
  label,
  value,
  onChange,
  presets,
  formatCurrency,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: number[];
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-text-main">{label}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted font-mono text-sm">ETB</span>
        <input
          type="number"
          min="0"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          className="w-full pl-14 pr-4 py-3 rounded-xl border border-border-subtle bg-surface text-text-main font-mono text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>
      {presets && (
        <div className="flex gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(p))}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition cursor-pointer ${
                parseFloat(value) === p
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface-2 text-text-main border-border-subtle hover:border-border-strong'
              }`}
            >
              {formatCurrency(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Denomination counter row for cash counting. */
function DenomRow({
  denom,
  count,
  onChange,
  formatCurrency,
}: {
  denom: Denom;
  count: number;
  onChange: (v: number) => void;
  formatCurrency: (n: number) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border-subtle/40 last:border-0">
      <span className="text-sm font-mono font-semibold text-text-main w-20">{formatCurrency(denom)}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, count - 1))}
          className="w-8 h-8 rounded-lg border border-border-subtle bg-surface flex items-center justify-center text-text-main hover:bg-surface-2 transition cursor-pointer font-bold"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          value={count}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className="w-14 text-center rounded-lg border border-border-subtle bg-surface text-text-main font-mono text-sm py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => onChange(count + 1)}
          className="w-8 h-8 rounded-lg border border-border-subtle bg-surface flex items-center justify-center text-text-main hover:bg-surface-2 transition cursor-pointer font-bold"
        >
          +
        </button>
      </div>
      <span className="text-sm font-mono text-text-muted w-24 text-right">{formatCurrency(denom * count)}</span>
    </div>
  );
}

// ── Main modal panel ──────────────────────────────────────────────────────────
type PanelMode = 'start' | 'end' | 'drop' | null;

interface DayControlBarProps {
  /** Called when a day is successfully started — parent can refresh catalog. */
  onDayStarted?: () => void;
  /** Programmatically request opening the Start Day dialog */
  openStartRequested?: boolean;
  onStartRequestedHandled?: () => void;
}

export const DayControlBar: React.FC<DayControlBarProps> = ({
  onDayStarted,
  openStartRequested,
  onStartRequestedHandled,
}) => {
  const { t, formatCurrency, language } = useI18n();
  const { currentUser } = useAuth();
  const { currentShift, isShiftOpen, isLoadingShift, openShift, closeShift, refreshShift } = useShift();

  // ── Elapsed time display ──
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    if (!currentShift?.openedAt) return;
    const tick = () => setElapsed(fmtElapsed(currentShift.openedAt));
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [currentShift?.openedAt]);

  const hours24 = currentShift?.openedAt ? elapsedHours(currentShift.openedAt) : 0;

  // ── Panel state ──
  const [panel, setPanel] = useState<PanelMode>(null);
  const closePanel = () => setPanel(null);

  // External trigger for start day
  useEffect(() => {
    if (openStartRequested && !isShiftOpen) {
      setFloatStr('1000');
      setStartErr(null);
      setPanel('start');
      onStartRequestedHandled?.();
    }
  }, [openStartRequested, isShiftOpen, onStartRequestedHandled]);

  // ── Start day state ──
  const [floatStr, setFloatStr] = useState('1000');
  const [startErr, setStartErr] = useState<string | null>(null);
  const [startBusy, setStartBusy] = useState(false);

  const handleStartDay = async () => {
    const amount = parseFloat(floatStr);
    if (isNaN(amount) || amount < 0) {
      setStartErr(t('checkout.invalidFloat'));
      return;
    }
    setStartBusy(true);
    setStartErr(null);
    try {
      const res = await openShift(amount);
      if (!res.success) {
        setStartErr(res.error || t('checkout.startDayFailed'));
      } else {
        closePanel();
        onDayStarted?.();
      }
    } finally {
      setStartBusy(false);
    }
  };

  // ── End day state ──
  const [endDenoms, setEndDenoms] = useState<DenomMap>({ ...ZERO_DENOMS });
  const [endNotes, setEndNotes] = useState('');
  const [endErr, setEndErr] = useState<string | null>(null);
  const [endBusy, setEndBusy] = useState(false);
  const [endDone, setEndDone] = useState(false);
  const [variance, setVariance] = useState<number | null>(null);
  const [expectedCash, setExpectedCash] = useState<number>(0);

  const physicalCash = useMemo(() => denomTotal(endDenoms), [endDenoms]);

  // Load X-report when end panel opens
  useEffect(() => {
    if (panel !== 'end' || !currentShift?.id) return;
    const branchId = currentUser?.branchId || '';
    const userRole = currentUser?.role || 'CASHIER';
    posApi.getXReport(currentShift.id, userRole, branchId)
      .then((r) => setExpectedCash(r.expected_cash ?? (r.opening_float + (r.cash_sales_amount || 0) - (r.total_cash_drops || 0))))
      .catch(() => setExpectedCash(0));
  }, [panel, currentShift?.id]);

  const handleEndDay = async () => {
    setEndBusy(true);
    setEndErr(null);
    try {
      const res = await closeShift(physicalCash, endNotes || undefined);
      if (!res.success) {
        setEndErr(res.error || t('checkout.endDayFailed'));
      } else {
        setVariance(physicalCash - expectedCash);
        setEndDone(true);
      }
    } finally {
      setEndBusy(false);
    }
  };

  // ── Safe drop state ──
  const [dropStr, setDropStr] = useState('2000');
  const [dropReason, setDropReason] = useState('');
  const [dropErr, setDropErr] = useState<string | null>(null);
  const [dropBusy, setDropBusy] = useState(false);

  const handleDrop = async () => {
    const amount = parseFloat(dropStr);
    if (isNaN(amount) || amount <= 0) {
      setDropErr(t('checkout.dropAmountRequired'));
      return;
    }
    if (!currentShift?.id) return;
    setDropBusy(true);
    setDropErr(null);
    const branchId = currentUser?.branchId || '';
    const cashierId = currentUser?.id || '';
    try {
      await posApi.recordCashMovement(currentShift.id, cashierId, branchId, {
        movement_type: 'SAFE_DROP',
        amount,
        reason: dropReason || (language === 'am' ? 'ወደ ካዝና ማስቀመጥ' : 'Safe drop to vault'),
        authorized_by: cashierId,
      });
      closePanel();
      await refreshShift();
    } catch (err: any) {
      setDropErr(err.message || t('checkout.dropFailed'));
    } finally {
      setDropBusy(false);
    }
  };

  // ── Loading skeleton ──
  if (isLoadingShift) {
    return (
      <div className="h-10 flex items-center gap-2 px-4 py-2">
        <Loader2 size={16} className="animate-spin text-text-muted" />
        <span className="text-xs text-text-muted">{t('common.loading')}</span>
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* ── The strip itself ───────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-4 py-2 border-b border-border-subtle text-sm select-none ${
          isShiftOpen ? 'bg-surface' : 'bg-primary-soft/30'
        }`}
      >
        {isShiftOpen ? (
          <>
            {/* Day-open indicator */}
            <div className="flex items-center gap-1.5">
              <Sun size={15} className="text-primary flex-shrink-0" />
              <span className="font-semibold text-text-main">
                {t('checkout.dayOpenSince')} {fmtTime(currentShift!.openedAt)} · {elapsed}
              </span>
            </div>

            {hours24 >= 24 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-[11px] font-bold">
                <AlertTriangle size={12} />
                {t('checkout.over24h')}
              </span>
            )}

            <div className="flex-1" />

            {/* Put cash in safe */}
            <button
              type="button"
              onClick={() => { setDropStr('2000'); setDropReason(''); setDropErr(null); setPanel('drop'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-surface hover:bg-surface-2 text-text-muted hover:text-text-main transition text-xs font-semibold cursor-pointer"
            >
              <Coins size={14} />
              {t('checkout.putCashInSafe')}
            </button>

            {/* End day */}
            <button
              type="button"
              onClick={() => { setEndDenoms({ ...ZERO_DENOMS }); setEndNotes(''); setEndErr(null); setEndDone(false); setPanel('end'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger text-white hover:bg-danger/90 transition text-xs font-bold cursor-pointer shadow-soft"
            >
              <Moon size={14} />
              {t('checkout.endDay')}
              <ChevronDown size={13} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-primary font-semibold">
              <Sun size={15} />
              {t('checkout.dayNotStarted')}
            </div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => { setFloatStr('1000'); setStartErr(null); setPanel('start'); }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition text-sm font-bold cursor-pointer shadow-soft"
            >
              <Sun size={15} />
              {t('checkout.startDay')}
            </button>
          </>
        )}
      </div>

      {/* ── Panel overlay ──────────────────────────────────────────────── */}
      {panel && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-2xs flex items-start justify-center pt-24"
          onClick={closePanel}
        >
          <div
            className="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border-subtle overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <h2 className="font-bold text-base text-text-main">
                {panel === 'start' && t('checkout.startDay')}
                {panel === 'end' && t('checkout.endDay')}
                {panel === 'drop' && t('checkout.putCashInSafe')}
              </h2>
              <button type="button" onClick={closePanel} className="text-text-muted hover:text-text-main cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* ── START DAY ─────────────────────────────────────────── */}
              {panel === 'start' && (
                <>
                  <p className="text-sm text-text-muted leading-relaxed">{t('checkout.startDayDesc')}</p>
                  <FloatInput
                    label={t('checkout.openingCash')}
                    value={floatStr}
                    onChange={setFloatStr}
                    presets={[500, 1000, 2000, 5000]}
                    formatCurrency={formatCurrency}
                  />
                  {startErr && (
                    <p className="text-sm text-danger font-medium">{startErr}</p>
                  )}
                  <button
                    type="button"
                    disabled={startBusy}
                    onClick={handleStartDay}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition disabled:opacity-60 cursor-pointer shadow-soft"
                  >
                    {startBusy
                      ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('checkout.startingDay')}</span>
                      : t('checkout.startDay')}
                  </button>
                </>
              )}

              {/* ── END DAY ───────────────────────────────────────────── */}
              {panel === 'end' && (
                <>
                  {endDone ? (
                    // ── Success state ──
                    <div className="flex flex-col items-center gap-3 py-4">
                      <CheckCircle2 size={48} className="text-success" />
                      <h3 className="font-bold text-lg text-text-main">{t('checkout.dayEnded')}</h3>
                      <div className={`text-center px-4 py-2 rounded-xl font-semibold ${
                        variance === null ? '' :
                        Math.abs(variance!) < 1 ? 'bg-success-soft text-success' :
                        variance! > 0 ? 'bg-info-soft text-info' : 'bg-danger-soft text-danger'
                      }`}>
                        {variance !== null && (
                          <span>
                            {variance === 0
                              ? t('checkout.varianceZero')
                              : variance > 0
                              ? `${t('checkout.varianceOver')} ${formatCurrency(Math.abs(variance!))}`
                              : `${t('checkout.varianceShort')} ${formatCurrency(Math.abs(variance!))}`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={closePanel}
                        className="mt-2 px-6 py-2 rounded-xl bg-primary text-white font-bold cursor-pointer"
                      >
                        {t('common.done')}
                      </button>
                    </div>
                  ) : (
                    // ── Count cash ──
                    <>
                      <p className="text-sm text-text-muted">{t('checkout.endDayDesc')}</p>

                      {/* Expected vs counted summary */}
                      <div className="flex justify-between text-sm font-semibold text-text-main bg-surface-2 rounded-xl px-4 py-3">
                        <span>{t('checkout.expectedCash')}</span>
                        <span className="font-mono">{formatCurrency(expectedCash)}</span>
                      </div>

                      {/* Denomination counter */}
                      <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 flex flex-col gap-0.5">
                        <p className="text-xs font-bold text-text-muted mb-2">{t('checkout.countYourCash')}</p>
                        {DENOMS.map((d) => (
                          <DenomRow
                            key={d}
                            denom={d}
                            count={endDenoms[d]}
                            onChange={(v) => setEndDenoms((prev) => ({ ...prev, [d]: v }))}
                            formatCurrency={formatCurrency}
                          />
                        ))}
                        <div className="flex justify-between font-bold text-sm mt-2 pt-2 border-t border-border-subtle text-text-main">
                          <span>{t('checkout.totalCounted')}</span>
                          <span className="font-mono">{formatCurrency(physicalCash)}</span>
                        </div>
                      </div>

                      {/* Variance preview */}
                      {physicalCash > 0 && (
                        <div className={`flex justify-between text-sm font-semibold px-4 py-2 rounded-xl ${
                          Math.abs(physicalCash - expectedCash) < 1
                            ? 'bg-success-soft text-success'
                            : physicalCash > expectedCash
                            ? 'bg-info-soft text-info'
                            : 'bg-warning-soft text-warning'
                        }`}>
                          <span>{t('checkout.difference')}</span>
                          <span className="font-mono">
                            {physicalCash >= expectedCash ? '+' : ''}
                            {formatCurrency(physicalCash - expectedCash)}
                          </span>
                        </div>
                      )}

                      <input
                        type="text"
                        value={endNotes}
                        onChange={(e) => setEndNotes(e.target.value)}
                        placeholder={language === 'am' ? 'ማስታወሻ (አማራጭ)' : 'Notes (optional)'}
                        className="px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />

                      {endErr && <p className="text-sm text-danger font-medium">{endErr}</p>}

                      <button
                        type="button"
                        disabled={endBusy}
                        onClick={handleEndDay}
                        className="w-full py-3 rounded-xl bg-danger text-white font-bold text-base hover:bg-danger/90 transition disabled:opacity-60 cursor-pointer shadow-soft"
                      >
                        {endBusy
                          ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('checkout.endingDay')}</span>
                          : t('checkout.confirmEndDay')}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* ── SAFE DROP ─────────────────────────────────────────── */}
              {panel === 'drop' && (
                <>
                  <p className="text-sm text-text-muted">{t('checkout.dropDesc')}</p>
                  <FloatInput
                    label={t('checkout.dropAmount')}
                    value={dropStr}
                    onChange={setDropStr}
                    presets={[500, 1000, 2000, 5000]}
                    formatCurrency={formatCurrency}
                  />
                  <input
                    type="text"
                    value={dropReason}
                    onChange={(e) => setDropReason(e.target.value)}
                    placeholder={language === 'am' ? 'ምክንያት (አማራጭ)' : 'Reason (optional)'}
                    className="px-4 py-2.5 rounded-xl border border-border-subtle bg-surface text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  {dropErr && <p className="text-sm text-danger font-medium">{dropErr}</p>}
                  <button
                    type="button"
                    disabled={dropBusy}
                    onClick={handleDrop}
                    className="w-full py-3 rounded-xl bg-primary text-white font-bold text-base hover:bg-primary/90 transition disabled:opacity-60 cursor-pointer shadow-soft"
                  >
                    {dropBusy
                      ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('common.saving')}</span>
                      : t('checkout.confirmDrop')}
                  </button>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
