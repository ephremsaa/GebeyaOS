import { describe, it, expect } from 'vitest';
import { allocateFEFO, FEFOBatchCandidate } from '../src';

describe('FEFO Allocator', () => {
  const sampleBatches: FEFOBatchCandidate[] = [
    {
      id: 'batch-03',
      batchNumber: 'B-2026-LATER',
      expiryDate: '2026-12-31',
      unitCost: 100,
      currentQuantity: 15,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'batch-01',
      batchNumber: 'B-2026-EARLIEST',
      expiryDate: '2026-06-30',
      unitCost: 95,
      currentQuantity: 10,
      createdAt: '2026-02-01T00:00:00Z',
    },
    {
      id: 'batch-02',
      batchNumber: 'B-2026-MID',
      expiryDate: '2026-09-30',
      unitCost: 98,
      currentQuantity: 20,
      createdAt: '2026-01-15T00:00:00Z',
    },
  ];

  it('allocates from earliest expiring batch first', () => {
    const result = allocateFEFO(sampleBatches, 5);

    expect(result.fullyAllocated).toBe(true);
    expect(result.totalAllocated).toBe(5);
    expect(result.unallocatedQuantity).toBe(0);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe('batch-01');
    expect(result.allocations[0].quantity).toBe(5);
  });

  it('splits allocation across multiple batches in expiry order', () => {
    // Needs 25: batch-01 has 10, batch-02 has 20
    const result = allocateFEFO(sampleBatches, 25);

    expect(result.fullyAllocated).toBe(true);
    expect(result.totalAllocated).toBe(25);
    expect(result.allocations).toHaveLength(2);

    expect(result.allocations[0].batchId).toBe('batch-01');
    expect(result.allocations[0].quantity).toBe(10);

    expect(result.allocations[1].batchId).toBe('batch-02');
    expect(result.allocations[1].quantity).toBe(15);
  });

  it('prioritizes dated batches before undated batches (FIFO fallback)', () => {
    const mixedBatches: FEFOBatchCandidate[] = [
      {
        id: 'non-perishable-old',
        batchNumber: 'NP-01',
        expiryDate: null,
        unitCost: 50,
        currentQuantity: 10,
        createdAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'perishable-soon',
        batchNumber: 'P-01',
        expiryDate: '2026-08-01',
        unitCost: 60,
        currentQuantity: 5,
        createdAt: '2026-03-01T00:00:00Z',
      },
    ];

    const result = allocateFEFO(mixedBatches, 12);

    expect(result.allocations[0].batchId).toBe('perishable-soon');
    expect(result.allocations[0].quantity).toBe(5);

    expect(result.allocations[1].batchId).toBe('non-perishable-old');
    expect(result.allocations[1].quantity).toBe(7);
  });

  it('handles insufficient stock when negative stock is disallowed', () => {
    // Total available in sampleBatches is 45. Request 50.
    const result = allocateFEFO(sampleBatches, 50, { allowNegativeStock: false });

    expect(result.fullyAllocated).toBe(false);
    expect(result.totalAllocated).toBe(45);
    expect(result.unallocatedQuantity).toBe(5);
    expect(result.allocations).toHaveLength(3);
  });

  it('allocates deficit to latest batch when negative stock and strategy=latest', () => {
    const result = allocateFEFO(sampleBatches, 50, {
      allowNegativeStock: true,
      deficitBatchStrategy: 'latest',
    });

    expect(result.fullyAllocated).toBe(true);
    expect(result.totalAllocated).toBe(50);
    expect(result.unallocatedQuantity).toBe(0);

    // Last batch is batch-03 (expires latest)
    const lastAllocation = result.allocations.find((a) => a.batchId === 'batch-03');
    expect(lastAllocation).toBeDefined();
    expect(lastAllocation!.quantity).toBe(20); // 15 original + 5 deficit
  });

  it('handles zero or negative requested quantity gracefully', () => {
    const resultZero = allocateFEFO(sampleBatches, 0);
    expect(resultZero.allocations).toHaveLength(0);
    expect(resultZero.totalAllocated).toBe(0);
    expect(resultZero.fullyAllocated).toBe(true);

    const resultNegative = allocateFEFO(sampleBatches, -5);
    expect(resultNegative.allocations).toHaveLength(0);
    expect(resultNegative.totalAllocated).toBe(0);
    expect(resultNegative.fullyAllocated).toBe(true);
  });

  it('skips depleted batches with currentQuantity <= 0', () => {
    const batchesWithDepleted: FEFOBatchCandidate[] = [
      {
        id: 'depleted-01',
        batchNumber: 'DEP-01',
        expiryDate: '2026-05-01',
        unitCost: 10,
        currentQuantity: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'active-01',
        batchNumber: 'ACT-01',
        expiryDate: '2026-06-01',
        unitCost: 12,
        currentQuantity: 8,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const result = allocateFEFO(batchesWithDepleted, 5);
    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe('active-01');
    expect(result.allocations[0].quantity).toBe(5);
  });
});
