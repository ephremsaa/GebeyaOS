import {
  FEFOBatchCandidate,
  FEFOAllocationItem,
  FEFOAllocationResult,
} from './inventory.types';
import { computeDaysLeftInAddis, getAddisTodayString } from './date-fefo.helper';

export interface FEFOAllocationOptions {
  allowNegativeStock?: boolean;
  deficitBatchStrategy?: 'none' | 'latest';
  filterExpired?: boolean;
  allowExpiredStock?: boolean;
  todayStr?: string;
}

/**
 * First-Expired, First-Out (FEFO) batch allocation engine.
 * For perishable supermarket inventory (dairy, meat, produce, bakery).
 * Falls back to FIFO (earliest createdAt) for batches without an expiry date.
 * When filterExpired is true (e.g. In POS sales), strictly blocks allocation from expired batches (daysLeft < 0).
 */
export function allocateFEFO(
  candidates: FEFOBatchCandidate[],
  requestedQuantity: number,
  options: FEFOAllocationOptions = {},
): FEFOAllocationResult {
  const allowNegativeStock = options.allowNegativeStock ?? false;
  const deficitStrategy = options.deficitBatchStrategy ?? 'none';
  const shouldFilterExpired = options.filterExpired === true || (options.allowExpiredStock === false && options.filterExpired !== false);
  const todayStr = options.todayStr || getAddisTodayString();

  const round3 = (val: number) => Math.round((val + Number.EPSILON) * 1000) / 1000;

  let remaining = round3(requestedQuantity);

  if (remaining <= 0) {
    return {
      allocations: [],
      totalAllocated: 0,
      unallocatedQuantity: 0,
      fullyAllocated: true,
      expiredBatchesBlocked: [],
    };
  }

  // Filter out expired batches when filterExpired is enabled
  const expiredBatchesBlocked: FEFOBatchCandidate[] = [];
  const validCandidates: FEFOBatchCandidate[] = [];

  for (const c of candidates) {
    if (shouldFilterExpired && c.expiryDate) {
      const days = computeDaysLeftInAddis(c.expiryDate, todayStr);
      if (days !== null && days < 0) {
        expiredBatchesBlocked.push(c);
        continue;
      }
    }
    validCandidates.push(c);
  }

  // Sort candidates:
  // 1. Batches with expiryDate come first, ordered ascending (earliest unexpired first).
  // 2. Batches with null expiryDate follow, ordered by createdAt ascending (FIFO fallback).
  const sorted = [...validCandidates].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      const expDiff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
      if (expDiff !== 0) return expDiff;
    } else if (a.expiryDate && !b.expiryDate) {
      return -1; // Perishable first
    } else if (!a.expiryDate && b.expiryDate) {
      return 1;
    }

    // Fallback to FIFO by createdAt
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const allocations: FEFOAllocationItem[] = [];

  for (const batch of sorted) {
    if (batch.currentQuantity <= 0) {
      continue;
    }

    const available = round3(batch.currentQuantity);
    const take = round3(Math.min(available, remaining));

    if (take > 0) {
      allocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: take,
        unitCost: batch.unitCost,
        expiryDate: batch.expiryDate,
      });

      remaining = round3(remaining - take);
    }

    if (remaining <= 0) {
      break;
    }
  }

  // Handle deficit when stock is insufficient
  if (remaining > 0) {
    if (allowNegativeStock && deficitStrategy === 'latest' && sorted.length > 0) {
      const targetBatch = sorted[sorted.length - 1];
      const existing = allocations.find((a) => a.batchId === targetBatch.id);

      if (existing) {
        existing.quantity = round3(existing.quantity + remaining);
      } else {
        allocations.push({
          batchId: targetBatch.id,
          batchNumber: targetBatch.batchNumber,
          quantity: remaining,
          unitCost: targetBatch.unitCost,
          expiryDate: targetBatch.expiryDate,
        });
      }

      const totalAllocated = round3(
        allocations.reduce((sum, item) => sum + item.quantity, 0),
      );

      return {
        allocations,
        totalAllocated,
        unallocatedQuantity: 0,
        fullyAllocated: true,
        expiredBatchesBlocked,
      };
    }

    const totalAllocated = round3(
      allocations.reduce((sum, item) => sum + item.quantity, 0),
    );

    return {
      allocations,
      totalAllocated,
      unallocatedQuantity: remaining,
      fullyAllocated: false,
      expiredBatchesBlocked,
    };
  }

  const totalAllocated = round3(
    allocations.reduce((sum, item) => sum + item.quantity, 0),
  );

  return {
    allocations,
    totalAllocated,
    unallocatedQuantity: 0,
    fullyAllocated: true,
    expiredBatchesBlocked,
  };
}
