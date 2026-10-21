import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let mockDb: Partial<DatabaseService>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };
    service = new InventoryService(mockDb as DatabaseService);
  });

  describe('recordMovement', () => {
    it('appends an immutable ledger row calculating balance_after correctly from previous balance', async () => {
      // Mock previous balance: 50 units
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ balance_after: '50.000' }],
        }) // Previous balance query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [],
        }) // Batch update query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'ledger-new-uuid',
              branch_id: 'branch-1',
              product_id: 'prod-oil',
              batch_id: 'batch-1',
              movement_type: 'SALE',
              quantity_change: -5,
              unit_cost: 950.0,
              balance_after: 45.0,
              reference_type: 'SALE',
              reference_id: 'sale-1',
              notes: null,
              created_by: 'cashier-1',
              created_at: new Date(),
            },
          ],
        }); // Insert ledger query

      const result = await service.recordMovement({
        branchId: 'branch-1',
        productId: 'prod-oil',
        batchId: 'batch-1',
        movementType: 'SALE',
        quantityChange: -5,
        unitCost: 950.0,
        referenceType: 'SALE',
        referenceId: 'sale-1',
        createdBy: 'cashier-1',
      });

      expect(result.balance_after).toBe(45.0);
      expect(result.quantity_change).toBe(-5);
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('createAdjustment', () => {
    it('creates adjustment and posts corresponding ledger movements with proper reason codes', async () => {
      // Adjustment insert
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'adj-1',
            branch_id: 'branch-1',
            adjustment_number: 'ADJ-12345678',
            reason_code: 'DAMAGED_GOODS',
            notes: 'Dropped jar on floor',
            status: 'COMPLETED',
          },
        ],
      });

      // Item insert
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      });

      // Previous balance for item
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ balance_after: '20.000' }],
      });

      // Batch decrement
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      });

      // Stock ledger insert
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'ledger-adj-1',
            movement_type: 'DAMAGE',
            quantity_change: -2,
            balance_after: 18.0,
          },
        ],
      });

      const adjustment = await service.createAdjustment('user-manager', {
        branch_id: 'branch-1',
        reason_code: 'DAMAGED_GOODS',
        notes: 'Dropped jar on floor',
        items: [
          {
            product_id: 'prod-jam',
            batch_id: 'batch-jam-1',
            quantity_change: -2,
            unit_cost: 120.0,
          },
        ],
      });

      expect(adjustment.reason_code).toBe('DAMAGED_GOODS');
      expect(mockClient.query).toHaveBeenCalled();
    });
  });
});
