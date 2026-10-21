import { describe, it, expect } from 'vitest';
import {
  FefoAllocatorService,
  InsufficientStockException,
} from '../../src/modules/inventory/domain/fefo-allocator.service';
import { Batch } from '../../src/modules/inventory/domain/inventory.types';

describe('FefoAllocatorService', () => {
  const allocator = new FefoAllocatorService();

  const mockBatches: Batch[] = [
    {
      id: 'batch-exp-tomorrow',
      branch_id: 'branch-1',
      product_id: 'prod-milk',
      batch_number: 'B-001',
      expiry_date: '2026-10-22', // Expiring first
      unit_cost: 65.0,
      initial_quantity: 10,
      current_quantity: 4,
      created_at: new Date('2026-10-15'),
      updated_at: new Date('2026-10-15'),
    },
    {
      id: 'batch-exp-next-week',
      branch_id: 'branch-1',
      product_id: 'prod-milk',
      batch_number: 'B-002',
      expiry_date: '2026-10-29', // Expiring second
      unit_cost: 68.0,
      initial_quantity: 20,
      current_quantity: 15,
      created_at: new Date('2026-10-18'),
      updated_at: new Date('2026-10-18'),
    },
  ];

  it('allocates strictly from the earliest expiring batch when sufficient', () => {
    // Requesting 3 units, Batch 1 has 4
    const result = allocator.allocate(mockBatches, 3, false, 'prod-milk');

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].batchId).toBe('batch-exp-tomorrow');
    expect(result.allocations[0].allocatedQuantity).toBe(3);
    expect(result.remainingDeficit).toBe(0);
  });

  it('splits allocations across multiple batches when first batch is depleted', () => {
    // Requesting 10 units: takes all 4 from Batch 1, and 6 from Batch 2
    const result = allocator.allocate(mockBatches, 10, false, 'prod-milk');

    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].batchId).toBe('batch-exp-tomorrow');
    expect(result.allocations[0].allocatedQuantity).toBe(4);
    expect(result.allocations[1].batchId).toBe('batch-exp-next-week');
    expect(result.allocations[1].allocatedQuantity).toBe(6);
    expect(result.remainingDeficit).toBe(0);
  });

  it('throws InsufficientStockException if total stock < requested and negative stock disallowed', () => {
    // Total available = 4 + 15 = 19. Requesting 25 units.
    expect(() =>
      allocator.allocate(mockBatches, 25, false, 'prod-milk'),
    ).toThrow(InsufficientStockException);
  });

  it('allocates remaining deficit to the latest batch when negative stock is allowed', () => {
    // Total available = 19. Requesting 25 units with allowNegativeStock = true.
    const result = allocator.allocate(mockBatches, 25, true, 'prod-milk');

    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].allocatedQuantity).toBe(4);
    // Batch 2 takes 15 available + 6 deficit = 21 allocated
    expect(result.allocations[1].batchId).toBe('batch-exp-next-week');
    expect(result.allocations[1].allocatedQuantity).toBe(21);
    expect(result.remainingDeficit).toBe(6);
  });
});
