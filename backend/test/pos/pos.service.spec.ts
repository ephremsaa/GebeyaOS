import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PosService } from '../../src/modules/pos/pos.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

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

  describe('openShift - One-Open-Shift Rule', () => {
    it('throws BadRequestException if terminal already has an active open shift', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'active-shift-1' }],
      });

      await expect(
        service.openShift('cashier-1', {
          terminal_id: 'term-1',
          opening_cash_float: 1000.0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a new shift with incremented shift number and records opening float movement', async () => {
      (mockDb.query as any)
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // No active open shift
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ branch_id: 'branch-1' }] }) // Terminal lookup
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ max_shift: '3' }] }) // Max shift number
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-new',
              branch_id: 'branch-1',
              terminal_id: 'term-1',
              cashier_id: 'cashier-1',
              shift_number: 4,
              opening_cash_float: 1000.0,
              status: 'OPEN',
            },
          ],
        }) // Insert shift
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // Insert FLOAT_IN cash movement
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // Sync outbox

      const shift = await service.openShift('cashier-1', {
        terminal_id: 'term-1',
        opening_cash_float: 1000.0,
      });

      expect(shift.shift_number).toBe(4);
      expect(shift.opening_cash_float).toBe(1000.0);
      expect(shift.status).toBe('OPEN');
    });
  });

  describe('getXReport - Expected Cash Math and Blind Close Role Visibility', () => {
    const setupXReportDb = () => {
      (mockDb.query as any)
        // 1. Shift record
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-1',
              terminal_id: 'term-1',
              cashier_id: 'cashier-1',
              shift_number: 1,
              status: 'OPEN',
              opened_at: new Date().toISOString(),
              opening_cash_float: '1000.0000',
            },
          ],
        })
        // 2. Payments by method
        .mockResolvedValueOnce({
          rowCount: 3,
          rows: [
            { payment_method: 'CASH', method_total: '3000.0000' },
            { payment_method: 'TELEBIRR', method_total: '1500.0000' },
            { payment_method: 'CARD_POS', method_total: '1000.0000' },
          ],
        })
        // 3. Gross sales count and change given
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ count: '5', gross_sales: '5500.0000', change_given: '200.0000' }],
        })
        // 4. Cash movements
        .mockResolvedValueOnce({
          rowCount: 3,
          rows: [
            { movement_type: 'SAFE_DROP', total_amount: '1000.0000' },
            { movement_type: 'ADDITIONAL_FLOAT', total_amount: '500.0000' },
            { movement_type: 'PETTY_CASH_OUT', total_amount: '100.0000' },
          ],
        })
        // 5. Customer refunds
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_refunds: '200.0000' }],
        });
    };

    it('calculates expected cash accurately: opening + add_float + net_cash_sales - drops - petty_cash - refunds', async () => {
      setupXReportDb();
      // Net cash sales = 3000 (cash tendered) - 200 (change given) = 2800
      // Expected = 1000 (opening) + 500 (additional float) + 2800 (net cash) - 1000 (safe drop) - 100 (petty cash) - 200 (refunds) = 3000
      const report = await service.getXReport('shift-1', 'BRANCH_MANAGER');

      expect(report.opening_float).toBe(1000.0);
      expect(report.cash_sales_amount).toBe(2800.0);
      expect(report.telebirr_sales_amount).toBe(1500.0);
      expect(report.card_sales_amount).toBe(1000.0);
      expect(report.total_cash_drops).toBe(1000.0);
      expect(report.total_refunds).toBe(200.0);
      expect(report.expected_cash).toBe(3000.0);
      expect(report.is_blind_close).toBe(false);
    });

    it('hides expected cash from CASHIER role (blind close visibility)', async () => {
      setupXReportDb();
      const report = await service.getXReport('shift-1', 'CASHIER');

      expect(report.expected_cash).toBeNull();
      expect(report.is_blind_close).toBe(true);
      expect(report.cash_sales_amount).toBe(2800.0);
    });
  });

  describe('closeShift - Held Baskets & Variance Approval Rule', () => {
    it('blocks closing shift if there are active held baskets', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'shift-1', terminal_id: 'term-1', status: 'OPEN' }],
        })
        // Held baskets query returns 2 active held baskets
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ count: '2' }],
        });

      await expect(
        service.closeShift('shift-1', 'cashier-1', { closing_cash_counted: 2000.0 }),
      ).rejects.toThrow(/Cannot close shift with 2 active held basket/);
    });

    it('reconciles expected cash vs counted cash and succeeds within variance threshold', async () => {
      mockClient.query
        // 1. Shift query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-1',
              branch_id: 'branch-1',
              terminal_id: 'term-1',
              opening_cash_float: '1000.0000',
              status: 'OPEN',
            },
          ],
        })
        // 2. Held baskets query (0 active)
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        // 3. Cash sales and change
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_cash: '2500.0000', change_given: '0.0000' }],
        })
        // 4. Cash movements
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ cash_in: '200.0000', cash_out: '500.0000' }],
        })
        // 5. Refunds
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_refunds: '0.0000' }] })
        // 6. Branch settings (variance threshold: 50 ETB)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ settings: { variance_approval_threshold: '50.00' } }],
        })
        // 7. Update shifts
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'shift-1', status: 'CLOSED' }],
        })
        // 8. Audit log
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 9. Sync outbox
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      // Expected Cash = 1000 + 200 + 2500 - 500 = 3200 ETB
      // Counted Cash = 3230 ETB (30 ETB variance <= 50 threshold)
      const result = await service.closeShift('shift-1', 'cashier-1', {
        closing_cash_counted: 3230.0,
      });

      expect(result.expected_cash).toBe(3200.0);
      expect(result.counted_cash).toBe(3230.0);
      expect(result.cash_variance).toBe(30.0);
    });

    it('requires manager approval when variance exceeds configurable threshold', async () => {
      mockClient.query
        // 1. Shift query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-1',
              branch_id: 'branch-1',
              terminal_id: 'term-1',
              opening_cash_float: '1000.0000',
              status: 'OPEN',
            },
          ],
        })
        // 2. Held baskets query (0 active)
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        // 3. Cash sales and change
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_cash: '2500.0000', change_given: '0.0000' }],
        })
        // 4. Cash movements
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ cash_in: '200.0000', cash_out: '500.0000' }],
        })
        // 5. Refunds
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_refunds: '0.0000' }] })
        // 6. Branch settings (variance threshold: 50 ETB)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ settings: { variance_approval_threshold: '50.00' } }],
        });

      // Expected Cash = 3200 ETB. Counted Cash = 3300 ETB (variance 100 ETB > 50 ETB threshold)
      await expect(
        service.closeShift('shift-1', 'cashier-1', {
          closing_cash_counted: 3300.0,
        }),
      ).rejects.toThrow(/Manager approval is required/);
    });

    it('permits closing with large variance when authorized by manager', async () => {
      mockClient.query
        // 1. Shift query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'shift-1',
              branch_id: 'branch-1',
              terminal_id: 'term-1',
              opening_cash_float: '1000.0000',
              status: 'OPEN',
            },
          ],
        })
        // 2. Held baskets query (0 active)
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        // 3. Cash sales and change
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ total_cash: '2500.0000', change_given: '0.0000' }],
        })
        // 4. Cash movements
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ cash_in: '200.0000', cash_out: '500.0000' }],
        })
        // 5. Refunds
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ total_refunds: '0.0000' }] })
        // 6. Branch settings (variance threshold: 50 ETB)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ settings: { variance_approval_threshold: '50.00' } }],
        })
        // 7. Manager authorization lookup
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: '018e0000-0000-7000-8000-000000000001', name: 'BRANCH_MANAGER' }],
        })
        // 8. Update shifts
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'shift-1', status: 'CLOSED' }],
        })
        // 9. Audit log
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 10. Sync outbox
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const result = await service.closeShift('shift-1', 'cashier-1', {
        closing_cash_counted: 3300.0,
        authorized_by: '018e0000-0000-7000-8000-000000000001',
      });

      expect(result.cash_variance).toBe(100.0);
    });
  });

  describe('recordCashMovement - Safe Drop Authorization', () => {
    it('requires manager authorization for SAFE_DROP of 2000 ETB or more', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ branch_id: 'branch-1', status: 'OPEN' }],
      });

      await expect(
        service.recordCashMovement('shift-1', 'cashier-1', {
          movement_type: 'SAFE_DROP',
          amount: 2500.0,
          reason: 'Excess midday cash drop',
        }),
      ).rejects.toThrow(/require manager authorization/);
    });

    it('allows large SAFE_DROP when valid authorized_by is provided', async () => {
      (mockDb.query as any)
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ branch_id: 'branch-1', status: 'OPEN' }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'mov-1',
              movement_type: 'SAFE_DROP',
              amount: 2500.0,
              authorized_by: 'mgr-1',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // Sync outbox

      const mov = await service.recordCashMovement('shift-1', 'cashier-1', {
        movement_type: 'SAFE_DROP',
        amount: 2500.0,
        reason: 'Excess midday cash drop',
        authorized_by: 'mgr-1',
      });

      expect(mov.amount).toBe(2500.0);
      expect(mov.authorized_by).toBe('mgr-1');
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

  describe('processSale - Split Payment, VAT & Rounding, FEFO, and Outbox', () => {
    it('executes atomic sale: FEFO deduction, split tender (CASH + TELEBIRR), VAT per line rounding, and outbox event', async () => {
      // 0. Idempotency check: no existing sale found
      mockClient.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });
      // 1. Shift open
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'shift-1', status: 'OPEN', shift_number: 1 }],
      });
      // 2. Branch
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'branch-1', code: 'BOLE01', name: 'Bole Store', settings: {} }],
      });
      // 3. Terminal
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'term-1', code: 'POS01' }],
      });
      // 4. Cashier
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ full_name: 'Ephrem Cashier', max_discount_percentage: '10.00' }],
      });
      // 5. Product 1: Taxable item (115 ETB gross -> 15 ETB VAT, 100 ETB base)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-taxable',
            name_en: 'Anchor Milk 1L',
            base_price: '115.0000',
            cost_price: '80.0000',
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
          },
        ],
      });
      // 6. Product 2: Exempt item (85 ETB gross -> 0 ETB VAT, 85 ETB base)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-exempt',
            name_en: 'Fresh Injera',
            base_price: '85.0000',
            cost_price: '60.0000',
            is_vat_applicable: false,
            vat_rate: '0.0000',
            override_price: null,
          },
        ],
      });
      // 7. Day-sequence query for offline receipt number
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ count: '4' }],
      });
      // 8. INSERT INTO sales
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 9. INSERT INTO sale_items (prod-taxable)
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 10. INSERT INTO sale_items (prod-exempt)
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 11. INSERT INTO sale_payments (CASH)
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 12. INSERT INTO sale_payments (TELEBIRR)
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 13. INSERT INTO fiscal_receipt_logs
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 14. INSERT INTO sync_outbox
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      // Total due = 115 + 85 = 200 ETB.
      // Split payments: CASH 150 ETB, TELEBIRR 70 ETB. Total paid = 220 ETB. Change = 20 ETB.
      const result = await service.processSale('cashier-1', {
        branch_id: 'branch-1',
        terminal_id: 'term-1',
        shift_id: 'shift-1',
        idempotency_key: 'idem-sale-split-01',
        items: [
          { product_id: 'prod-taxable', quantity: 1, unit_price: 115.0 },
          { product_id: 'prod-exempt', quantity: 1, unit_price: 85.0 },
        ],
        payments: [
          { payment_method: 'CASH', amount: 150.0 },
          { payment_method: 'TELEBIRR', amount: 70.0, provider_reference: 'TLB-998877' },
        ],
      });

      expect(result.grand_total).toBe(200.0);
      expect(result.total_paid).toBe(220.0);
      expect(result.change_given).toBe(20.0);
      expect(result.receipt_number).toMatch(/BOLE01-POS01-\d{8}-01-00005/);

      // Verify FEFO allocations and SALE inventory movement
      expect(mockInventoryService.allocateFefo).toHaveBeenCalledTimes(2);
      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
          movementType: 'SALE',
          quantityChange: -1,
        }),
        mockClient,
      );

      // Verify atomic sync_outbox enqueue in same transaction
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_outbox'),
        expect.arrayContaining(['branch-1', 'idem-sale-split-01']),
      );
    });
  });

  describe('processSale - Idempotency & Double-Tap Prevention', () => {
    it('returns previously processed sale without deducting stock or re-charging if idempotency_key matches', async () => {
      // 0. Idempotency check query finds existing sale
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'sale-already-processed',
            branch_id: 'branch-1',
            receipt_number: 'BOLE01-POS01-20261026-01-00001',
            grand_total: '150.0000',
            total_paid: '150.0000',
            change_given: '0.0000',
            idempotency_key: 'idem-key-double-tap-1',
          },
        ],
      });
      // sale_items query for replay
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'item-1' }],
      });

      const replay = await service.processSale('cashier-1', {
        branch_id: 'branch-1',
        terminal_id: 'term-1',
        shift_id: 'shift-1',
        idempotency_key: 'idem-key-double-tap-1',
        items: [{ product_id: 'prod-1', quantity: 1, unit_price: 150.0 }],
        payments: [{ payment_method: 'CASH', amount: 150.0 }],
      });

      expect(replay.sale_id).toBe('sale-already-processed');
      expect(replay.is_replay).toBe(true);
      expect(replay.grand_total).toBe(150.0);
      // Inventory MUST NOT be allocated or deducted on replay
      expect(mockInventoryService.allocateFefo).not.toHaveBeenCalled();
      expect(mockInventoryService.recordMovement).not.toHaveBeenCalled();
    });
  });

  describe('processSale - Negative Stock Rule', () => {
    it('blocks checkout when branch disallows negative stock and inventory is insufficient', async () => {
      // 1. Shift
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'shift-1', status: 'OPEN', shift_number: 1 }],
      });
      // 2. Branch with allow_negative_stock = false
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'branch-1', code: 'BOLE01', settings: { allow_negative_stock: false } }],
      });
      // 3. Terminal
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'term-1', code: 'POS01' }],
      });
      // 4. Cashier
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ full_name: 'Cashier 1', max_discount_percentage: '10.00' }],
      });
      // 5. Product
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-oos',
            name_en: 'Sugar 1kg',
            base_price: '80.0000',
            cost_price: '60.0000',
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
          },
        ],
      });

      // allocateFefo throws InsufficientStockException
      const { InsufficientStockException } = await import(
        '../../src/modules/inventory/domain/fefo-allocator.service'
      );
      mockInventoryService.allocateFefo = vi.fn().mockRejectedValueOnce(
        new InsufficientStockException('prod-oos', 5, 0),
      );

      await expect(
        service.processSale('cashier-1', {
          branch_id: 'branch-1',
          terminal_id: 'term-1',
          shift_id: 'shift-1',
          items: [{ product_id: 'prod-oos', quantity: 5, unit_price: 80.0 }],
          payments: [{ payment_method: 'CASH', amount: 400.0 }],
        }),
      ).rejects.toThrow('Insufficient stock for product \'Sugar 1kg\'. Negative stock is disabled.');
    });
  });

  describe('processRefund - Manager PIN & Linked Refund Record', () => {
    it('processes refund, verifies manager authorization, links original sale, and returns stock via SALE_REFUND', async () => {
      // 1. Manager auth check (User is Branch Manager)
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'manager-1', name: 'BRANCH_MANAGER' }],
      });
      // 2. Original sale query
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'orig-sale-01',
            branch_id: 'branch-1',
            receipt_number: 'BOLE01-POS01-20261026-01-00001',
            payment_status: 'PAID',
          },
        ],
      });
      // 3. Original sale item query
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'sale-item-1',
            sale_id: 'orig-sale-01',
            product_id: 'prod-1',
            batch_id: 'batch-01',
            unit_price: '100.0000',
            unit_cost: '70.0000',
            is_vat_applicable: true,
            tax_rate: '0.1500',
          },
        ],
      });
      // 4. INSERT INTO sale_refunds
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 5. UPDATE sales SET payment_status = 'FULLY_REFUNDED'
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // 6. INSERT INTO sync_outbox
      mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const refund = await service.processRefund('cashier-1', {
        original_sale_id: 'orig-sale-01',
        authorized_by: 'manager-1',
        reason: 'Customer returned sealed expired item',
        items: [
          {
            original_sale_item_id: 'sale-item-1',
            product_id: 'prod-1',
            quantity: 1,
            refund_unit_price: 100.0,
            return_to_inventory: true,
          },
        ],
      });

      expect(refund.refund_number).toMatch(/^REF-/);
      expect(refund.total_refund_amount).toBe(100.0);
      expect(refund.tax_refund_amount).toBeCloseTo(13.0435, 2);

      // Verify stock was returned with SALE_REFUND
      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
          productId: 'prod-1',
          movementType: 'SALE_REFUND',
          quantityChange: 1, // Positive replenishment
          notes: 'Refund: Customer returned sealed expired item',
        }),
        mockClient,
      );
    });

    it('rejects refund if manager authorization is invalid', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 0,
        rows: [],
      });

      await expect(
        service.processRefund('cashier-1', {
          original_sale_id: 'orig-sale-01',
          authorized_by: 'fake-manager-id',
          reason: 'Return',
          items: [],
        }),
      ).rejects.toThrow('Invalid manager authorization.');
    });
  });
});
