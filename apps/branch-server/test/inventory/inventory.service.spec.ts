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
  });

  describe('reconcileStockTake', () => {
    it('records count variance compensations into ledger and marks stock take reconciled', async () => {
      // 1. Fetch stock take
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-01',
            branch_id: 'b-01',
            status: 'IN_PROGRESS',
          },
        ],
      });

      // 2. Fetch stock take items with variance
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'st-item-01',
            product_id: 'p-01',
            batch_id: null,
            system_quantity: '10.000',
            counted_quantity: '8.000',
            variance: '-2.000',
            unit_cost: '40.0000',
          },
        ],
      });

      // 3. Advisory lock for movement
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 4. Previous balance
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '10.000' }],
      });

      // 5. Insert ledger for COUNT_VARIANCE
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
            notes: 'Count variance reconciliation',
            created_by: 'auditor-01',
            created_at: new Date('2026-10-21T12:00:00Z'),
          },
        ],
      });

      // 6. Update stock_takes
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'st-01', status: 'RECONCILED' }],
      });

      const result = await service.reconcileStockTake('st-01', 'auditor-01');

      expect(result.status).toBe('RECONCILED');
      expect(result.adjustmentsRecorded).toBe(1);
    });

    it('rejects reconciliation if stock take is already reconciled', async () => {
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
      ).rejects.toThrow(BadRequestException);
    });
  });
});
