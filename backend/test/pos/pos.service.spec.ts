import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PosService } from '../../src/modules/pos/pos.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ForbiddenException } from '@nestjs/common';

describe('PosService', () => {
  let service: PosService;
  let mockDb: Partial<DatabaseService>;
  let mockInventoryService: Partial<InventoryService>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };
    mockInventoryService = {
      allocateFefo: vi.fn().mockResolvedValue({
        allocations: [
          {
            batchId: 'batch-1',
            batchNumber: 'B-001',
            expiryDate: '2026-11-01',
            unitCost: 80.0,
            allocatedQuantity: 1,
          },
        ],
        remainingDeficit: 0,
      }),
      recordMovement: vi.fn().mockResolvedValue({} as any),
    };

    service = new PosService(
      mockDb as DatabaseService,
      mockInventoryService as InventoryService,
    );
  });

  describe('openShift', () => {
    it('creates a new shift with incremented shift number', async () => {
      // 1. Existing open shifts: none
      (mockDb.query as any)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Active shift check
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ branch_id: 'branch-1' }],
        }) // Terminal query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ max_shift: '1' }],
        }) // Max shift query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-new',
              branch_id: 'branch-1',
              terminal_id: 'term-1',
              cashier_id: 'cashier-1',
              shift_number: 2,
              opening_cash_float: 1000.0,
              status: 'OPEN',
            },
          ],
        }); // Insert shift query

      const shift = await service.openShift('cashier-1', {
        terminal_id: 'term-1',
        opening_cash_float: 1000.0,
      });

      expect(shift.shift_number).toBe(2);
      expect(shift.opening_cash_float).toBe(1000.0);
    });
  });

  describe('closeShift', () => {
    it('accurately reconciles expected cash vs counted cash and computes variance', async () => {
      // 1. Shift query
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-1',
              opening_cash_float: '1000.0000',
              status: 'OPEN',
            },
          ],
        })
        // 2. Cash sales query (2,500 ETB in cash)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_cash: '2500.0000' }],
        })
        // 3. Cash movements query (Cash In: 200 ETB, Cash Out: 500 ETB)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ cash_in: '200.0000', cash_out: '500.0000' }],
        })
        // 4. Update shift query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'shift-1', status: 'CLOSED' }],
        });

      // Expected Cash = 1000 + 2500 + 200 - 500 = 3200 ETB
      // Counted Cash = 3250 ETB (50 ETB overage)
      const result = await service.closeShift('shift-1', 'cashier-1', {
        closing_cash_counted: 3250.0,
        notes: 'End of evening shift',
      });

      expect(result.expected_cash).toBe(3200.0);
      expect(result.counted_cash).toBe(3250.0);
      expect(result.cash_variance).toBe(50.0); // Overage
    });
  });

  describe('processSale - Role Discount Limit Enforcement', () => {
    it('throws ForbiddenException when cashier discount exceeds role maximum limit', async () => {
      // 1. Shift open
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'shift-1', status: 'OPEN', shift_number: 1 }],
        })
        // 2. Branch query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'branch-1', code: 'BOLE01', settings: {} }],
        })
        // 3. Terminal query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'term-1', code: 'POS01' }],
        })
        // 4. Cashier role query: max_discount_percentage is 5%
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ full_name: 'Cashier 1', max_discount_percentage: '5.00' }],
        })
        // 5. Product query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'prod-1',
              name_en: 'Item',
              base_price: '100.0000',
              cost_price: '70.0000',
              is_vat_applicable: true,
              vat_rate: '0.1500',
              override_price: null,
            },
          ],
        });

      // Attempting to apply 15% discount when role max is 5%
      await expect(
        service.processSale('cashier-1', {
          branch_id: 'branch-1',
          terminal_id: 'term-1',
          shift_id: 'shift-1',
          items: [
            {
              product_id: 'prod-1',
              quantity: 1,
              unit_price: 100.0,
              discount_percentage: 15, // EXCEEDS 5%
            },
          ],
          payments: [
            {
              payment_method: 'CASH',
              amount: 85.0,
            },
          ],
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
