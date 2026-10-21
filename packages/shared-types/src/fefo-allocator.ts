import {
  FEFOBatchCandidate,
  FEFOAllocationItem,
  FEFOAllocationResult,
} from './inventory.types';

export interface FEFOAllocationOptions {
  allowNegativeStock?: boolean;
  deficitBatchStrategy?: 'none' | 'latest';
}

/**
 * First-Expired, First-Out (FEFO) batch allocation engine.
 * For perishable supermarket inventory (dairy, meat, produce, bakery).
 * Falls back to FIFO (earliest createdAt) for batches without an expiry date.
 */
export function allocateFEFO(
  candidates: FEFOBatchCandidate[],
  requestedQuantity: number,
  options: FEFOAllocationOptions = {},
): FEFOAllocationResult {
  const allowNegativeStock = options.allowNegativeStock ?? false;
  const deficitStrategy = options.deficitBatchStrategy ?? 'none';

  const round3 = (val: number) => Math.round((val + Number.EPSILON) * 1000) / 1000;

  let remaining = round3(requestedQuantity);

  if (remaining <= 0) {
    return {
      allocations: [],
      totalAllocated: 0,
      unallocatedQuantity: 0,
      fullyAllocated: true,
    };
  }

  // Sort candidates:
  // 1. Batches with expiryDate come first, ordered ascending (earliest expiry first).
  // 2. Batches with null expiryDate follow, ordered by createdAt ascending (FIFO fallback).
  const sorted = [...candidates].sort((a, b) => {
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
  };
}
