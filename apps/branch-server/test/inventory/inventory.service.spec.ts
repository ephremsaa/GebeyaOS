import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('InventoryService', () => {
  let service: InventoryService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };

    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };

    service = new InventoryService(mockDb as unknown as DatabaseService);
  });

  describe('recordMovementInTransaction', () => {
    it('calculates running balance and inserts append-only ledger entry', async () => {
      // 1. Advisory lock query
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 2. Fetch previous balance: 10
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '10.000' }],
      });

      // 3. Fallback cost query (if cost not provided)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '50.0000' }],
      });

      // 4. Insert ledger
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-01',
            branch_id: 'b-01',
            product_id: 'p-01',
            batch_id: null,
            movement_type: 'PURCHASE_RECEIVE',
            quantity_change: '5.000',
            unit_cost: '50.0000',
            balance_after: '15.000',
            reference_type: 'GRN',
            reference_id: 'grn-01',
            notes: 'Received shipment',
            created_by: 'user-01',
            created_at: new Date('2026-10-21T10:00:00Z'),
          },
        ],
      });

      const entry = await service.recordMovementInTransaction(
        mockClient,
        'b-01',
        {
          productId: 'p-01',
          movementType: 'PURCHASE_RECEIVE',
          quantityChange: 5,
          referenceType: 'GRN',
          referenceId: 'grn-01',
          notes: 'Received shipment',
          createdBy: 'user-01',
        },
      );

      expect(entry.balanceAfter).toBe(15);
      expect(entry.quantityChange).toBe(5);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['b-01', 'p-01'],
      );
    });

    it('rejects transaction when balance becomes negative and negative stock is disallowed', async () => {
      // 1. Advisory lock
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 2. Previous balance: 2
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '2.000' }],
      });

      // Attempt to deduct 5 when stock is 2
      await expect(
        service.recordMovementInTransaction(mockClient, 'b-01', {
          productId: 'p-01',
          movementType: 'SALE',
          quantityChange: -5,
          referenceType: 'SALE',
          referenceId: 'sale-01',
          allowNegativeStock: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permits negative balance when allowNegativeStock is true', async () => {
      // 1. Advisory lock
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 2. Previous balance: 1
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '1.000' }],
      });

      // 3. Fallback cost
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '30.0000' }],
      });

      // 4. Insert ledger with balance_after = -4
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-02',
            branch_id: 'b-01',
            product_id: 'p-01',
            batch_id: null,
            movement_type: 'SALE',
            quantity_change: '-5.000',
            unit_cost: '30.0000',
            balance_after: '-4.000',
            reference_type: 'SALE',
            reference_id: 'sale-02',
            notes: null,
            created_by: null,
            created_at: new Date('2026-10-21T10:05:00Z'),
          },
        ],
      });

      const entry = await service.recordMovementInTransaction(
        mockClient,
        'b-01',
        {
          productId: 'p-01',
          movementType: 'SALE',
          quantityChange: -5,
          referenceType: 'SALE',
          referenceId: 'sale-02',
          allowNegativeStock: true,
        },
      );

      expect(entry.balanceAfter).toBe(-4);
    });

    it('updates batch quantity when batchId is provided', async () => {
      // 1. Advisory lock
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 2. Previous balance: 20
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '20.000' }],
      });

      // 3. Update batch
      mockClient.query.mockResolvedValueOnce({
        rows: [{ current_quantity: '17.000' }],
      });

      // 4. Insert ledger
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-03',
            branch_id: 'b-01',
            product_id: 'p-01',
            batch_id: 'batch-01',
            movement_type: 'SALE',
            quantity_change: '-3.000',
            unit_cost: '25.0000',
            balance_after: '17.000',
            reference_type: 'SALE',
            reference_id: 'sale-03',
            notes: null,
            created_by: null,
            created_at: new Date('2026-10-21T10:10:00Z'),
          },
        ],
      });

      const entry = await service.recordMovementInTransaction(
        mockClient,
        'b-01',
        {
          productId: 'p-01',
          batchId: 'batch-01',
          movementType: 'SALE',
          quantityChange: -3,
          unitCost: 25,
          referenceType: 'SALE',
          referenceId: 'sale-03',
        },
      );

      expect(entry.batchId).toBe('batch-01');
      expect(entry.balanceAfter).toBe(17);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE batches'),
        [-3, 'batch-01', 'b-01'],
      );
    });
  });

  describe('createAdjustment', () => {
    it('creates adjustment and records corresponding damage ledger movement', async () => {
      // 1. Count query for adjustment number
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '2' }],
      });

      // 2. Insert stock_adjustments
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'adj-01',
            branch_id: 'b-01',
            adjustment_number: 'ADJ-20261021-0003',
            reason_code: 'DAMAGED_GOODS',
            notes: 'Dropped jar of honey',
            status: 'COMPLETED',
            approved_by: 'manager-01',
            created_by: 'user-01',
            created_at: new Date('2026-10-21T11:00:00Z'),
          },
        ],
      });

      // 3. Insert stock_adjustment_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'adj-item-01',
            adjustment_id: 'adj-01',
            product_id: 'p-honey',
            batch_id: null,
            quantity_change: '-1.000',
            unit_cost: '250.0000',
            created_at: new Date('2026-10-21T11:00:00Z'),
          },
        ],
      });

      // 4. Advisory lock for recordMovementInTransaction
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 5. Fetch previous balance
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '10.000' }],
      });

      // 6. Insert stock_ledger
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-dmg-01',
            branch_id: 'b-01',
            product_id: 'p-honey',
            batch_id: null,
            movement_type: 'DAMAGE',
            quantity_change: '-1.000',
            unit_cost: '250.0000',
            balance_after: '9.000',
            reference_type: 'ADJUSTMENT',
            reference_id: 'adj-01',
            notes: 'DAMAGED_GOODS: Dropped jar of honey',
            created_by: 'user-01',
            created_at: new Date('2026-10-21T11:00:00Z'),
          },
        ],
      });

      const adj = await service.createAdjustment('b-01', 'user-01', {
        reasonCode: 'DAMAGED_GOODS',
        notes: 'Dropped jar of honey',
        items: [
          {
            productId: 'p-honey',
            quantityChange: -1,
            unitCost: 250,
          },
        ],
      });

      expect(adj.adjustmentNumber).toContain('ADJ-');
      expect(adj.reasonCode).toBe('DAMAGED_GOODS');
      expect(adj.items).toHaveLength(1);
      expect(adj.items![0].quantityChange).toBe(-1);
    });

    it('rejects large write-off (> 20 units) when neither approvedBy nor valid managerPin is provided', async () => {
      await expect(
        service.createAdjustment('b-01', 'user-01', {
          reasonCode: 'DAMAGED_GOODS',
          notes: 'Broken shelf collapsed',
          items: [
            {
              productId: 'p-honey',
              quantityChange: -25, // 25 units > 20
              unitCost: 100,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects large write-off (> 5,000 ETB) when neither approvedBy nor valid managerPin is provided', async () => {
      await expect(
        service.createAdjustment('b-01', 'user-01', {
          reasonCode: 'EXPIRED',
          notes: 'Expired cosmetics lot',
          items: [
            {
              productId: 'p-perfume',
              quantityChange: -5,
              unitCost: 1500, // 7,500 ETB > 5,000 ETB
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('approves large write-off when valid managerPin is provided', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // adjustment number seq
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'adj-pin-01',
              branch_id: 'b-01',
              adjustment_number: 'ADJ-20261021-0006',
              reason_code: 'DAMAGED_GOODS',
              notes: 'Authorized with PIN',
              status: 'COMPLETED',
              approved_by: 'user-01',
              created_by: 'user-01',
              created_at: new Date('2026-10-21T11:00:00Z'),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'item-01',
              adjustment_id: 'adj-pin-01',
              product_id: 'p-honey',
              batch_id: null,
              quantity_change: '-30.000',
              unit_cost: '200.0000',
              created_at: new Date('2026-10-21T11:00:00Z'),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({ rows: [{ balance_after: '50.000' }] }) // previous balance
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ledger-pin-01',
              branch_id: 'b-01',
              product_id: 'p-honey',
              batch_id: null,
              movement_type: 'DAMAGE',
              quantity_change: '-30.000',
              unit_cost: '200.0000',
              balance_after: '20.000',
              reference_type: 'ADJUSTMENT',
              reference_id: 'adj-pin-01',
              notes: 'DAMAGED_GOODS: Authorized with PIN',
              created_by: 'user-01',
              created_at: new Date('2026-10-21T11:00:00Z'),
            },
          ],
        });

      const adj = await service.createAdjustment('b-01', 'user-01', {
        reasonCode: 'DAMAGED_GOODS',
        notes: 'Authorized with PIN',
        managerPin: '1234',
        items: [
          {
            productId: 'p-honey',
            quantityChange: -30,
            unitCost: 200,
          },
        ],
      });

      expect(adj.id).toBe('adj-pin-01');
      expect(adj.status).toBe('COMPLETED');
    });
  });

  describe('FEFO Batches & Ledger History', () => {
    it('retrieves active batches ordered by FEFO (earliest expiry first)', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'batch-01',
            batch_number: 'LOT-A',
            expiry_date: new Date('2026-11-10'),
            unit_cost: '60.00',
            initial_quantity: '50.00',
            current_quantity: '20.00',
            created_at: new Date('2026-10-01'),
          },
          {
            id: 'batch-02',
            batch_number: 'LOT-B',
            expiry_date: new Date('2026-12-20'),
            unit_cost: '62.00',
            initial_quantity: '100.00',
            current_quantity: '90.00',
            created_at: new Date('2026-10-05'),
          },
        ],
      });

      const batches = await service.getBatches('b-01', 'p-honey');

      expect(batches).toHaveLength(2);
      expect(batches[0].batchNumber).toBe('LOT-A');
      expect(batches[0].expiryDate).toBe('2026-11-10');
      expect(batches[1].batchNumber).toBe('LOT-B');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY expiry_date ASC NULLS LAST'),
        ['b-01', 'p-honey'],
      );
    });

    it('retrieves paginated ledger audit trail with balanceAfter', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '25' }] }) // Count query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'led-1',
              branch_id: 'b-01',
              product_id: 'p-honey',
              batch_id: 'batch-01',
              movement_type: 'PURCHASE_RECEIVE',
              quantity_change: '50.000',
              unit_cost: '60.0000',
              balance_after: '50.000',
              reference_type: 'GRN',
              reference_id: 'grn-01',
              notes: 'Intake shipment',
              created_by: 'user-01',
              created_at: new Date('2026-10-20T10:00:00Z'),
            },
          ],
        }); // Ledger rows

      const history = await service.getLedgerHistory('b-01', 'p-honey', 10, 0);

      expect(history.total).toBe(25);
      expect(history.entries).toHaveLength(1);
      expect(history.entries[0].balanceAfter).toBe(50);
      expect(history.entries[0].quantityChange).toBe(50);
    });
  });

  describe('Stocktake: Snapshot Math, Concurrent Sales, Approval Flow & Immutability', () => {
    it('records count variance compensations into ledger and marks stock take reconciled', async () => {
      // 1. Fetch stock take
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-01',
            branch_id: 'b-01',
            status: 'IN_PROGRESS',
            started_at: new Date('2026-10-21T10:00:00Z'),
          },
        ],
      });

      // 2. Fetch stock take items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-item-01',
            product_id: 'p-01',
            batch_id: null,
            system_quantity: '10.000',
            counted_quantity: '8.000',
            unit_cost: '40.0000',
          },
        ],
      });

      // 3. Later movements query: 0
      mockClient.query.mockResolvedValueOnce({
        rows: [{ later_movements: '0' }],
      });

      // 4. Advisory lock for movement
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 5. Previous balance
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '10.000' }],
      });

      // 6. Insert ledger for COUNT_VARIANCE
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-var-01',
            branch_id: 'b-01',
            product_id: 'p-01',
            batch_id: null,
            movement_type: 'COUNT_VARIANCE',
            quantity_change: '-2.000',
            unit_cost: '40.0000',
            balance_after: '8.000',
            reference_type: 'STOCK_TAKE',
            reference_id: 'st-01',
            notes: 'stocktake',
            created_by: 'auditor-01',
            created_at: new Date('2026-10-21T12:00:00Z'),
          },
        ],
      });

      // 7. Update stock_take_items
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 8. Update stock_takes
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'st-01', status: 'RECONCILED' }],
      });

      const result = await service.reconcileStockTake('st-01', 'auditor-01');

      expect(result.status).toBe('RECONCILED');
      expect(result.adjustmentsRecorded).toBe(1);
    });

    it('accounts for concurrent sales during counting: expected = snapshot + later sales', async () => {
      // Stock take started when system had 50 units
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-sales-01',
            branch_id: 'b-01',
            status: 'IN_PROGRESS',
            started_at: new Date('2026-10-21T08:00:00Z'),
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-item-oil',
            product_id: 'p-oil',
            batch_id: null,
            system_quantity: '50.000',
            counted_quantity: '43.000', // Counter found 43 on the shelf
            unit_cost: '100.0000',
          },
        ],
      });

      // During counting, 5 units were sold at POS registers (later_movements = -5)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ later_movements: '-5.000' }],
      });

      // Expected = 50 + (-5) = 45 units.
      // Since counter found 43, variance = 43 - 45 = -2 (not 43 - 50 = -7!)
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // advisory lock
      mockClient.query.mockResolvedValueOnce({ rows: [{ balance_after: '45.000' }] }); // prev balance
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ledger-oil-var',
            branch_id: 'b-01',
            product_id: 'p-oil',
            movement_type: 'COUNT_VARIANCE',
            quantity_change: '-2.000',
            balance_after: '43.000',
            created_at: new Date(),
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // update item
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // update stock_takes

      const result = await service.reconcileStockTake('st-sales-01', 'mgr-01', {
        managerPin: '1234',
        notes: 'Reconciled with concurrent sales adjustments',
      });

      expect(result.adjustmentsRecorded).toBe(1);
      // Verify the variance movement was posted with quantity change = -2 (not -7!)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO stock_ledger'),
        expect.arrayContaining([-2, 100, 43, 'st-sales-01', 'stocktake']),
      );
    });

    it('rejects recording counts on an already reconciled session (immutability)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ status: 'RECONCILED' }],
      });

      await expect(
        service.recordStockTakeCounts('st-01', {
          items: [{ productId: 'p-01', countedQuantity: 15 }],
        }),
      ).rejects.toThrow(/Session is immutable/);
    });

    it('rejects reconciliation if stock take is already reconciled (immutability)', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-01',
            branch_id: 'b-01',
            status: 'RECONCILED',
          },
        ],
      });

      await expect(
        service.reconcileStockTake('st-01', 'auditor-01'),
      ).rejects.toThrow(/Session is immutable/);
    });

    it('rejects reconciliation when invalid manager PIN is supplied', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'st-01', branch_id: 'b-01', status: 'IN_PROGRESS' }],
      });

      await expect(
        service.reconcileStockTake('st-01', 'user-01', {
          managerPin: '9999', // Incorrect PIN
        }),
      ).rejects.toThrow(/Invalid manager authorization PIN/);
    });

    it('generates stocktake variance report with category breakdown and shrinkage percentage', async () => {
      // Mock getStockTakeById
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'st-rep-01',
              count_number: 'ST-20261021-0001',
              started_at: new Date('2026-10-21T08:00:00Z'),
              completed_at: new Date('2026-10-21T11:00:00Z'),
              status: 'RECONCILED',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'i-1',
              product_id: 'p-milk',
              sku: 'MILK-1L',
              name_en: 'Whole Milk 1L',
              category_name: 'Dairy & Eggs',
              system_quantity: '50.000',
              later_movements: '0',
              counted_quantity: '45.000', // -5 shrinkage
              variance: '-5.000',
              unit_cost: '60.0000',
              variance_value: '-300.00',
              barcodes: ['112233'],
            },
            {
              id: 'i-2',
              product_id: 'p-bread',
              sku: 'BREAD-1',
              name_en: 'White Bread',
              category_name: 'Bakery & Grains',
              system_quantity: '20.000',
              later_movements: '0',
              counted_quantity: '20.000', // 0 variance
              variance: '0.000',
              unit_cost: '30.0000',
              variance_value: '0.00',
              barcodes: ['445566'],
            },
          ],
        });

      const report = await service.getStockTakeReport('st-rep-01');

      expect(report.stockTakeId).toBe('st-rep-01');
      expect(report.totalItems).toBe(2);
      expect(report.totalCountedItems).toBe(2);
      // Total Snapshot Value: 50*60 + 20*30 = 3000 + 600 = 3600 ETB
      expect(report.totalSnapshotValue).toBe(3600);
      // Shrinkage value: |-300| = 300 ETB
      expect(report.totalShrinkageValue).toBe(300);
      // Shrinkage %: (300 / 3600) * 100 = 8.33%
      expect(report.shrinkagePercent).toBe(8.33);
      expect(report.categories).toHaveLength(2);
      expect(report.categories[0].categoryName).toBe('Dairy & Eggs');
      expect(report.categories[0].shrinkagePercent).toBe(10); // 300 / 3000 = 10%
    });
  });
});
