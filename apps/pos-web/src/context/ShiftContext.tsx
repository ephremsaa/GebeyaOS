import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Shift } from '@gebeyaos/shared-types';
import { useAuth } from '../auth/AuthContext';
import { posApi } from '../utils/pos-api';

export interface ShiftContextType {
  currentShift: Shift | null;
  isShiftOpen: boolean;
  isLoadingShift: boolean;
  shiftError: string | null;
  terminalId: string;
  terminalCode: string;
  branchId: string;
  openShift: (openingCashFloat: number, notes?: string) => Promise<{ success: boolean; shift?: Shift; error?: string }>;
  closeShift: (closingCashActual: number, notes?: string) => Promise<{ success: boolean; error?: string }>;
  refreshShift: () => Promise<void>;
}

const ShiftContext = createContext<ShiftContextType | undefined>(undefined);

export const ShiftProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, terminalConfig, isAuthenticated } = useAuth();

  const [resolvedTerminalId, setResolvedTerminalId] = useState<string>(() => {
    return terminalConfig?.terminalId || localStorage.getItem('gebeyaos_terminal_id') || '';
  });
  const [terminalCode, setTerminalCode] = useState<string>(() => {
    return terminalConfig?.terminalCode || localStorage.getItem('gebeyaos_terminal_code') || 'POS-01';
  });

  const branchId = currentUser?.branchId || '01a19309-1d43-7444-b260-5b2ffac3e40c';
  const cashierId = currentUser?.id || '';

  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [isLoadingShift, setIsLoadingShift] = useState<boolean>(true);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const hasLoadedRef = useRef<boolean>(false);

  // 1. Resolve terminal ID if missing
  useEffect(() => {
    if (terminalConfig?.terminalId) {
      setResolvedTerminalId(terminalConfig.terminalId);
      setTerminalCode(terminalConfig.terminalCode || 'POS-01');
      localStorage.setItem('gebeyaos_terminal_id', terminalConfig.terminalId);
      localStorage.setItem('gebeyaos_terminal_code', terminalConfig.terminalCode || 'POS-01');
      return;
    }

    const resolveTerminal = async () => {
      try {
        const res = await fetch(`/api/system/terminals`, {
          headers: { 'x-branch-id': branchId },
        });
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list) && list.length > 0) {
            const active = list.find((t: any) => t.is_active) || list[0];
            setResolvedTerminalId(active.id);
            setTerminalCode(active.code || 'POS-01');
            localStorage.setItem('gebeyaos_terminal_id', active.id);
            localStorage.setItem('gebeyaos_terminal_code', active.code || 'POS-01');
          }
        }
      } catch {
        // Fallback to default ID if network unavailable
      }
    };

    if (!resolvedTerminalId && isAuthenticated) {
      resolveTerminal();
    }
  }, [terminalConfig, branchId, isAuthenticated, resolvedTerminalId]);

  // 2. Fetch current active shift from server (Single Source of Truth)
  const refreshShift = useCallback(async () => {
    if (!isAuthenticated || !resolvedTerminalId) {
      setIsLoadingShift(false);
      return;
    }

    setIsLoadingShift(true);
    setShiftError(null);

    try {
      const result = await posApi.getCurrentShift(resolvedTerminalId, branchId);
      if (result.open && result.shift) {
        setCurrentShift(result.shift);
        setShiftError(null);
      } else {
        setCurrentShift(null);
        setShiftError(null);
      }
    } catch (err: any) {
      console.warn('Network error loading shift from server:', err);
      // Keep previous shift if network fails temporarily, don't flash "no shift"
      setShiftError(err?.message || 'Failed to communicate with shift service');
    } finally {
      setIsLoadingShift(false);
      hasLoadedRef.current = true;
    }
  }, [isAuthenticated, resolvedTerminalId, branchId]);

  // Initial shift load on terminal resolve or login
  useEffect(() => {
    if (isAuthenticated && resolvedTerminalId) {
      refreshShift();
    } else if (!isAuthenticated) {
      setCurrentShift(null);
      setIsLoadingShift(false);
      hasLoadedRef.current = false;
    }
  }, [isAuthenticated, resolvedTerminalId, refreshShift]);

  // 3. Open Shift action (Idempotent)
  const openShift = useCallback(
    async (openingCashFloat: number, notes?: string) => {
      if (!resolvedTerminalId || !cashierId) {
        return { success: false, error: 'Terminal or Cashier session not ready' };
      }

      setIsLoadingShift(true);
      setShiftError(null);

      try {
        const opened = await posApi.openShift(branchId, resolvedTerminalId, cashierId, openingCashFloat, notes);
        if (opened && opened.id) {
          setCurrentShift(opened);
          setIsLoadingShift(false);
          return { success: true, shift: opened };
        }
        setIsLoadingShift(false);
        return { success: false, error: 'Could not open shift' };
      } catch (err: any) {
        setIsLoadingShift(false);
        const msg = err?.message || 'Failed to open shift';
        setShiftError(msg);
        return { success: false, error: msg };
      }
    },
    [branchId, resolvedTerminalId, cashierId],
  );

  // 4. Close Shift action
  const closeShift = useCallback(
    async (closingCashActual: number, notes?: string) => {
      if (!currentShift) {
        return { success: false, error: 'No active shift to close' };
      }

      setIsLoadingShift(true);
      try {
        await posApi.closeShift(currentShift.id, cashierId, branchId, { closing_cash_counted: closingCashActual, notes });

        setCurrentShift(null);
        setIsLoadingShift(false);
        return { success: true };
      } catch (err: any) {
        setIsLoadingShift(false);
        const msg = err?.message || 'Failed to close shift';
        setShiftError(msg);
        return { success: false, error: msg };
      }
    },
    [currentShift, cashierId, branchId],
  );

  const isShiftOpen = !!currentShift && currentShift.status === 'OPEN';

  return (
    <ShiftContext.Provider
      value={{
        currentShift,
        isShiftOpen,
        isLoadingShift,
        shiftError,
        terminalId: resolvedTerminalId || '01a19309-1d46-799e-8dbe-200bdd7ce436',
        terminalCode,
        branchId,
        openShift,
        closeShift,
        refreshShift,
      }}
    >
      {children}
    </ShiftContext.Provider>
  );
};

export const useShift = () => {
  const context = useContext(ShiftContext);
  if (!context) throw new Error('useShift must be used within a ShiftProvider');
  return context;
};
