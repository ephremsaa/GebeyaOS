import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { ForbiddenException } from '@nestjs/common';

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

  describe('createAdjustment & Permissions', () => {
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

    it('rejects large write-off (> 20 units) when neither approved_by nor valid manager_pin is provided', async () => {
      await expect(
        service.createAdjustment('user-cashier', {
          branch_id: 'branch-1',
          reason_code: 'DAMAGED_GOODS',
          notes: 'Water leak damaged entire carton',
          items: [
            {
              product_id: 'prod-biscuits',
              quantity_change: -25, // 25 units > 20 threshold
              unit_cost: 30, // 750 ETB
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects large write-off (> 5,000 ETB) when neither approved_by nor valid manager_pin is provided', async () => {
      await expect(
        service.createAdjustment('user-cashier', {
          branch_id: 'branch-1',
          reason_code: 'EXPIRED',
          notes: 'Expired imported olive oil',
          items: [
            {
              product_id: 'prod-oil',
              quantity_change: -6, // 6 units <= 20
              unit_cost: 1200, // 7,200 ETB > 5,000 ETB threshold
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('approves large write-off when valid manager_pin is provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'adj-large-1',
              branch_id: 'branch-1',
              adjustment_number: 'ADJ-11223344',
              reason_code: 'DAMAGED_GOODS',
              notes: 'Approved via manager PIN',
              status: 'COMPLETED',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // item insert
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ balance_after: '100.000' }] }) // prev balance
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'ledger-large-1',
              movement_type: 'DAMAGE',
              quantity_change: -50,
              balance_after: 50.0,
            },
          ],
        }); // ledger insert

      const adjustment = await service.createAdjustment('user-cashier', {
        branch_id: 'branch-1',
        reason_code: 'DAMAGED_GOODS',
        notes: 'Approved via manager PIN',
        manager_pin: '1234', // Valid manager PIN
        items: [
          {
            product_id: 'prod-biscuits',
            quantity_change: -50,
            unit_cost: 150,
          },
        ],
      });

      expect(adjustment.id).toBe('adj-large-1');
      expect(mockClient.query).toHaveBeenCalled();
    });

    it('approves large write-off when approved_by supervisor is provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'adj-large-2',
              branch_id: 'branch-1',
              adjustment_number: 'ADJ-11223355',
              reason_code: 'EXPIRED',
              notes: 'Authorized by manager',
              status: 'COMPLETED',
              approved_by: 'supervisor-uuid',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // item insert
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ balance_after: '30.000' }] }) // prev balance
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'ledger-large-2',
              movement_type: 'EXPIRED',
              quantity_change: -25,
              balance_after: 5.0,
            },
          ],
        }); // ledger insert

      const adjustment = await service.createAdjustment('user-cashier', {
        branch_id: 'branch-1',
        reason_code: 'EXPIRED',
        notes: 'Authorized by manager',
        approved_by: 'supervisor-uuid',
        items: [
          {
            product_id: 'prod-milk',
            quantity_change: -25,
            unit_cost: 75,
          },
        ],
      });

      expect(adjustment.approved_by).toBe('supervisor-uuid');
    });
  });

  describe('Ledger History & FEFO Batches', () => {
    it('retrieves paginated ledger audit trail with balance_after', async () => {
      (mockDb.query as any)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ count: '15' }],
        }) // Count
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            {
              id: 'ledger-1',
              branch_id: 'branch-1',
              product_id: 'prod-1',
              batch_id: 'batch-1',
              movement_type: 'PURCHASE_RECEIVE',
              quantity_change: '100.000',
              unit_cost: '45.0000',
              balance_after: '100.000',
              reference_type: 'PURCHASE_ORDER',
              reference_id: 'po-1',
              notes: 'Initial stock intake',
              created_by: 'admin-1',
              created_at: new Date('2026-10-20T10:00:00Z'),
            },
            {
              id: 'ledger-2',
              branch_id: 'branch-1',
              product_id: 'prod-1',
              batch_id: 'batch-1',
              movement_type: 'SALE',
              quantity_change: '-10.000',
              unit_cost: '45.0000',
              balance_after: '90.000',
              reference_type: 'SALE',
              reference_id: 'sale-1',
              notes: 'POS checkout',
              created_by: 'cashier-1',
              created_at: new Date('2026-10-21T14:30:00Z'),
            },
          ],
        }); // Rows

      const result = await service.getLedgerHistory('branch-1', 'prod-1', 10, 0);

      expect(result.total).toBe(15);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].movementType).toBe('PURCHASE_RECEIVE');
      expect(result.entries[0].balanceAfter).toBe(100);
      expect(result.entries[1].movementType).toBe('SALE');
      expect(result.entries[1].balanceAfter).toBe(90);
    });

    it('retrieves batches ordered by FEFO (earliest expiry first)', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            id: 'batch-fefo-1',
            batch_number: 'B-EARLY',
            expiry_date: new Date('2026-11-01'),
            unit_cost: '50.00',
            initial_quantity: '20.00',
            current_quantity: '12.00',
            created_at: new Date('2026-10-01'),
          },
          {
            id: 'batch-fefo-2',
            batch_number: 'B-LATER',
            expiry_date: new Date('2026-12-15'),
            unit_cost: '52.00',
            initial_quantity: '30.00',
            current_quantity: '30.00',
            created_at: new Date('2026-10-10'),
          },
        ],
      });

      const batches = await service.getBatches('branch-1', 'prod-1');

      expect(batches).toHaveLength(2);
      expect(batches[0].batchNumber).toBe('B-EARLY');
      expect(batches[0].expiryDate).toBe('2026-11-01');
      expect(batches[1].batchNumber).toBe('B-LATER');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY expiry_date ASC NULLS LAST'),
        ['branch-1', 'prod-1'],
      );
    });

    it('queries low stock alerts for items below min_stock_level', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-sugar',
            sku: 'SUGAR-1KG',
            name_en: 'Refined Sugar 1KG',
            min_stock_level: 20,
            current_stock: 5,
          },
        ],
      });

      const lowStock = await service.getLowStockAlerts('branch-1');

      expect(lowStock).toHaveLength(1);
      expect(lowStock[0].sku).toBe('SUGAR-1KG');
      expect(lowStock[0].current_stock).toBe(5);
    });
  });

  describe('Stocktake: Snapshot Math, Concurrent Sales & Immutability', () => {
    it('accounts for concurrent sales after snapshot: expected = snapshot + later sales', async () => {
      // 1. Fetch stock take
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'st-hq-1',
            branch_id: 'b-01',
            status: 'IN_PROGRESS',
            started_at: new Date('2026-10-21T09:00:00Z'),
          },
        ],
      });

      // 2. Fetch stock take items: snapshot = 100, counted = 88
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'item-hq-1',
            product_id: 'p-flour',
            batch_id: null,
            system_quantity: '100.000',
            counted_quantity: '88.000',
            unit_cost: '50.0000',
          },
        ],
      });

      // 3. Later movements since snapshot: 10 units sold (-10)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ later_movements: '-10.000' }],
      });

      // Expected = 100 + (-10) = 90.
      // Counted = 88 -> Variance = 88 - 90 = -2 (shrinkage of 2 units)
      // 4. Previous balance query for movement
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ balance_after: '90.000' }],
      });

      // 5. Insert ledger movement for COUNT_VARIANCE
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'ledger-hq-st',
            movement_type: 'COUNT_VARIANCE',
            quantity_change: -2,
            balance_after: 88,
          },
        ],
      });

      // 6. Update stock_take_items
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      // 7. Update stock_takes
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const result = await service.reconcileStockTake('st-hq-1', 'admin-01', {
        notes: 'Reconciled accounting for concurrent sales',
        manager_pin: '1234',
      });

      expect(result.variancesPosted).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_ledger'),
        expect.arrayContaining([-2, 50, 88, 'st-hq-1', 'stocktake']),
      );
    });

    it('rejects recording counts on a reconciled session (immutability)', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ status: 'RECONCILED' }],
      });

      await expect(
        service.recordStockTakeCounts('st-hq-1', {
          items: [{ product_id: 'p-1', counted_quantity: 20 }],
        }),
      ).rejects.toThrow(/Session is immutable/);
    });

    it('rejects reconciliation when stock take is already reconciled (immutability)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'st-hq-1', status: 'RECONCILED' }],
      });

      await expect(
        service.reconcileStockTake('st-hq-1', 'admin-01', {}),
      ).rejects.toThrow(/Session is immutable/);
    });
  });
});
