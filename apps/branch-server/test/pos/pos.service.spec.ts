import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PosService } from '../../src/modules/pos/pos.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PosService', () => {
  let service: PosService;
  let mockDb: any;
  let mockInventoryService: any;
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
      allocateBatchesForSale: vi.fn().mockResolvedValue({
        allocations: [{ batchId: 'batch-01', quantity: 2 }],
        totalAllocated: 2,
        unallocatedQuantity: 0,
        fullyAllocated: true,
      }),
      recordMovementInTransaction: vi.fn().mockResolvedValue({
        id: 'ledger-sale-01',
        balanceAfter: 8,
      }),
    };

    service = new PosService(
      mockDb as unknown as DatabaseService,
      mockInventoryService as unknown as InventoryService,
    );
  });

  describe('openShift', () => {
    it('opens new shift and records FLOAT_IN cash movement', async () => {
      // 1. Check active shift: none
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 2. Next shift number: 1
      mockClient.query.mockResolvedValueOnce({
        rows: [{ next_shift: '1' }],
      });

      // 3. Insert shift
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'shift-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            cashier_id: 'cashier-01',
            shift_number: 1,
            opening_cash_float: '1000.0000',
            expected_cash_system: '0.0000',
            status: 'OPEN',
            notes: null,
            opened_at: new Date('2026-10-21T08:00:00Z'),
            created_at: new Date('2026-10-21T08:00:00Z'),
          },
        ],
      });

      // 4. Insert cash_movement
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const shift = await service.openShift('b-01', 'cashier-01', {
        terminalId: 'term-01',
        openingCashFloat: 1000,
      });

      expect(shift.id).toBe('shift-01');
      expect(shift.status).toBe('OPEN');
      expect(shift.openingCashFloat).toBe(1000);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cash_movements'),
        expect.arrayContaining(['shift-01', 'b-01', 1000, 'cashier-01']),
      );
    });

    it('rejects opening a shift if terminal already has an active open shift', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-shift-01' }],
      });

      await expect(
        service.openShift('b-01', 'cashier-01', {
          terminalId: 'term-01',
          openingCashFloat: 500,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordCashMovement', () => {
    it('records SAFE_DROP for an active shift', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: 'OPEN' }],
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'cm-01',
            shift_id: 'shift-01',
            branch_id: 'b-01',
            movement_type: 'SAFE_DROP',
            amount: '5000.0000',
            reason: 'Excess cash transfer to safe',
            authorized_by: 'manager-01',
            created_at: new Date('2026-10-21T12:00:00Z'),
          },
        ],
      });

      const result = await service.recordCashMovement('b-01', 'shift-01', {
        movementType: 'SAFE_DROP',
        amount: 5000,
        reason: 'Excess cash transfer to safe',
        authorizedBy: 'manager-01',
      });

      expect(result.movementType).toBe('SAFE_DROP');
      expect(result.amount).toBe(5000);
    });
  });

  describe('getXReport', () => {
    it('calculates interim expected cash drawer balance accurately', async () => {
      // 1. Shift record (opening float = 1000)
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'shift-01',
            terminal_id: 'term-01',
            cashier_id: 'cashier-01',
            opening_cash_float: '1000.0000',
            opened_at: new Date('2026-10-21T08:00:00Z'),
          },
        ],
      });

      // 2. Sales totals: 10 sales, gross = 5000, change given = 200
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            total_sales_count: '10',
            gross_sales: '5000.0000',
            total_change_given: '200.0000',
          },
        ],
      });

      // 3. Payment methods: CASH tendered = 3200, TELEBIRR = 2000
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { payment_method: 'CASH', method_total: '3200.0000' },
          { payment_method: 'TELEBIRR', method_total: '2000.0000' },
        ],
      });

      // 4. Cash movements: SAFE_DROP = 1500
      mockDb.query.mockResolvedValueOnce({
        rows: [{ movement_type: 'SAFE_DROP', total_amount: '1500.0000' }],
      });

      const report = await service.getXReport('b-01', 'shift-01');

      // Net Cash Sales = 3200 tendered - 200 change = 3000
      // Expected = 1000 (float) + 3000 (net cash) - 1500 (safe drop) = 2500
      expect(report.totalSalesCount).toBe(10);
      expect(report.grossSalesAmount).toBe(5000);
      expect(report.cashSalesAmount).toBe(3000);
      expect(report.telebirrSalesAmount).toBe(2000);
      expect(report.totalCashDrops).toBe(1500);
      expect(report.expectedCashInDrawer).toBe(2500);
    });
  });

  describe('closeShift', () => {
    it('blind closes shift and computes variance against counted cash', async () => {
      // 1. Shift row FOR UPDATE
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'shift-01',
            status: 'OPEN',
          },
        ],
      });

      // getXReport mock queries:
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'shift-01',
            terminal_id: 'term-01',
            cashier_id: 'cashier-01',
            opening_cash_float: '1000.0000',
            opened_at: new Date('2026-10-21T08:00:00Z'),
          },
        ],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            total_sales_count: '5',
            gross_sales: '2000.0000',
            total_change_given: '0.0000',
          },
        ],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ payment_method: 'CASH', method_total: '2000.0000' }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [],
      });

      // UPDATE shifts query
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // Expected is 1000 + 2000 = 3000. Cashier counts 2980. Variance = -20 (short)
      const zReport = await service.closeShift('b-01', 'shift-01', {
        closingCashCounted: 2980,
      });

      expect(zReport.expectedCashInDrawer).toBe(3000);
      expect(zReport.closingCashCounted).toBe(2980);
      expect(zReport.cashVariance).toBe(-20);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'CLOSED'"),
        [2980, 3000, null, 'shift-01'],
      );
    });
  });

  describe('checkoutSale', () => {
    it('processes split-payment checkout, deducts stock via FEFO, and generates fiscal receipt', async () => {
      // 1. Verify shift
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'shift-01', shift_number: 1 }],
      });

      // 2. Branch details
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            code: 'BOLE01',
            name_en: 'Bole Supermarket',
            tin_number: '0012345678',
            vat_number: 'ETH-VAT-001',
          },
        ],
      });

      // 3. Terminal code
      mockClient.query.mockResolvedValueOnce({
        rows: [{ code: 'POS01' }],
      });

      // 4. Sales count today for sequence
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      // 5. uuid_generate_v7()
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'sale-uuid-01' }],
      });

      // 6. Product lookup for item
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'prod-milk',
            name_en: 'Anchor Milk 1L',
            base_price: '100.0000',
            cost_price: '75.0000',
            is_vat_applicable: true,
            vat_rate: '0.1500',
            effective_price: '100.0000',
          },
        ],
      });

      // 7. Insert sale
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-uuid-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            shift_id: 'shift-01',
            receipt_number: 'BOLE01-POS01-20261021-01-0001',
            cashier_id: 'cashier-01',
            subtotal: '200.0000',
            discount_total: '0.0000',
            taxable_subtotal: '173.9130',
            tax_exempt_subtotal: '0.0000',
            tax_total: '26.0870',
            grand_total: '200.0000',
            total_paid: '250.0000',
            change_given: '50.0000',
            payment_status: 'PAID',
            fiscal_status: 'FISCALIZED',
            fiscal_receipt_no: 'FRN-BOLE01-POS01-20261021-01-0001',
            fiscal_mrc: 'MOR-BOLE01-POS01',
            fiscal_signature: null,
            reprint_count: 0,
            client_timestamp: new Date('2026-10-21T14:00:00Z'),
            server_timestamp: new Date('2026-10-21T14:00:01Z'),
            created_at: new Date('2026-10-21T14:00:01Z'),
          },
        ],
      });

      // 8. Insert sale_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-01',
            sale_id: 'sale-uuid-01',
            product_id: 'prod-milk',
            batch_id: 'batch-01',
            barcode: null,
            item_name_snapshot: 'Anchor Milk 1L',
            quantity: '2.000',
            unit_price: '100.0000',
            unit_cost: '75.0000',
            discount_amount: '0.0000',
            discount_reason: null,
            is_vat_applicable: true,
            tax_rate: '0.1500',
            tax_amount: '26.0870',
            line_total: '200.0000',
            created_at: new Date('2026-10-21T14:00:01Z'),
          },
        ],
      });

      // 9. Insert sale_payments (Cash)
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-01',
            sale_id: 'sale-uuid-01',
            payment_method: 'CASH',
            amount: '150.0000',
            provider_reference: null,
            is_offline_verified: false,
            metadata: null,
            created_at: new Date('2026-10-21T14:00:01Z'),
          },
        ],
      });

      // 10. Insert sale_payments (Telebirr)
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-02',
            sale_id: 'sale-uuid-01',
            payment_method: 'TELEBIRR',
            amount: '100.0000',
            provider_reference: 'TB-12345678',
            is_offline_verified: true,
            metadata: null,
            created_at: new Date('2026-10-21T14:00:01Z'),
          },
        ],
      });

      // 11. Insert fiscal_receipt_logs
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 12. Insert sync_outbox
      mockClient.query.mockResolvedValueOnce({ rows: [] });


      const result = await service.checkoutSale('b-01', 'cashier-01', {
        terminalId: 'term-01',
        shiftId: 'shift-01',
        items: [{ productId: 'prod-milk', quantity: 2 }],
        payments: [
          { paymentMethod: 'CASH', amount: 150 },
          {
            paymentMethod: 'TELEBIRR',
            amount: 100,
            providerReference: 'TB-12345678',
            isOfflineVerified: true,
          },
        ],
      });

      expect(result.sale.grandTotal).toBe(200);
      expect(result.sale.totalPaid).toBe(250);
      expect(result.sale.changeGiven).toBe(50);
      expect(result.thermalReceipt).toContain('Anchor Milk 1L (A)');
      expect(result.thermalReceipt).toContain('TOTAL TO PAY:');
      expect(result.thermalReceipt).toContain('200.00 ETB');
      expect(result.thermalReceipt).toContain('TELEBIRR:');
      expect(result.thermalReceipt).toContain('TB-12345678');
      expect(result.electronicJournal.hashSignature).toBeDefined();

      // Ensure inventory was deducted with reference 'SALE'
      expect(mockInventoryService.recordMovementInTransaction).toHaveBeenCalledWith(
        mockClient,
        'b-01',
        expect.objectContaining({
          productId: 'prod-milk',
          movementType: 'SALE',
          quantityChange: -2,
        }),
      );
    });

    it('rejects checkout when payment is underpaid', async () => {
      // 1. Shift
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'shift-01', shift_number: 1 }],
      });
      // 2. Branch
      mockClient.query.mockResolvedValueOnce({
        rows: [{ code: 'BOLE01', name_en: 'Bole' }],
      });
      // 3. Term
      mockClient.query.mockResolvedValueOnce({
        rows: [{ code: 'POS01' }],
      });
      // 4. Sales count
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });
      // 5. UUID
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'sale-02' }],
      });
      // 6. Product
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p-01',
            name_en: 'Item 1',
            base_price: '100.0000',
            cost_price: '50.0000',
            is_vat_applicable: true,
            vat_rate: '0.1500',
            effective_price: '100.0000',
          },
        ],
      });

      // Total bill is 100, paying 80
      await expect(
        service.checkoutSale('b-01', 'cashier-01', {
          terminalId: 'term-01',
          shiftId: 'shift-01',
          items: [{ productId: 'p-01', quantity: 1 }],
          payments: [{ paymentMethod: 'CASH', amount: 80 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('refundSale', () => {
    it('processes refund and restocks inventory with SALE_REFUND', async () => {
      // 1. Original sale
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-01',
            branch_id: 'b-01',
            payment_status: 'PAID',
          },
        ],
      });

      // 2. Refund count
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });

      // 3. Original sale item
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-item-01',
            product_id: 'p-01',
            batch_id: 'b-01',
            unit_price: '100.0000',
            unit_cost: '60.0000',
            tax_amount: '13.0435',
          },
        ],
      });

      // 4. Insert sale_refunds
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'refund-01',
            original_sale_id: 'sale-01',
            refund_number: 'REF-20261021-0001',
            total_refund_amount: '100.0000',
            tax_refund_amount: '13.0435',
            reason: 'Defective packaging',
            created_at: new Date('2026-10-21T15:00:00Z'),
          },
        ],
      });

      // 5. Insert sale_refund_items
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 6. Update sale payment_status
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const refund = await service.refundSale('b-01', 'cashier-01', {
        originalSaleId: 'sale-01',
        authorizedBy: 'manager-01',
        shiftId: 'shift-01',
        reason: 'Defective packaging',
        items: [
          {
            originalSaleItemId: 'sale-item-01',
            quantity: 1,
            returnToInventory: true,
          },
        ],
      });

      expect(refund.refundNumber).toContain('REF-');
      expect(refund.totalRefundAmount).toBe(100);

      // Verify stock restock
      expect(mockInventoryService.recordMovementInTransaction).toHaveBeenCalledWith(
        mockClient,
        'b-01',
        expect.objectContaining({
          productId: 'p-01',
          movementType: 'SALE_REFUND',
          quantityChange: 1,
        }),
      );
    });
  });

  describe('idempotency and double-tap prevention', () => {
    it('returns previously completed sale without deducting inventory when same idempotencyKey is used', async () => {
      // Return existing sale when querying with idempotency_key
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-existing-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            shift_id: 'shift-01',
            receipt_number: 'BOLE01-POS01-20261021-01-0005',
            cashier_id: 'cashier-01',
            subtotal: '100.0000',
            discount_total: '0.0000',
            taxable_subtotal: '86.9600',
            tax_exempt_subtotal: '0.0000',
            tax_total: '13.0400',
            grand_total: '100.0000',
            total_paid: '100.0000',
            change_given: '0.0000',
            payment_status: 'PAID',
            fiscal_status: 'FISCALIZED',
            fiscal_receipt_no: 'FRN-0005',
            fiscal_mrc: 'MOR-BOLE',
            fiscal_signature: null,
            reprint_count: 0,
            idempotency_key: 'idemp-uuid-999',
            client_timestamp: new Date('2026-10-21T10:00:00Z'),
            server_timestamp: new Date('2026-10-21T10:00:01Z'),
            created_at: new Date('2026-10-21T10:00:01Z'),
          },
        ],
      });

      // sale_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-01',
            sale_id: 'sale-existing-01',
            product_id: 'prod-01',
            item_name_snapshot: 'Test Item',
            quantity: '1.000',
            unit_price: '100.0000',
            unit_cost: '60.0000',
            discount_amount: '0.0000',
            is_vat_applicable: true,
            tax_rate: '0.1500',
            tax_amount: '13.0400',
            line_total: '100.0000',
            created_at: new Date('2026-10-21T10:00:01Z'),
          },
        ],
      });

      // sale_payments
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'pay-01',
            sale_id: 'sale-existing-01',
            payment_method: 'CASH',
            amount: '100.0000',
            provider_reference: null,
            is_offline_verified: false,
            metadata: null,
            created_at: new Date('2026-10-21T10:00:01Z'),
          },
        ],
      });

      const res = await service.checkoutSale('b-01', 'cashier-01', {
        terminalId: 'term-01',
        shiftId: 'shift-01',
        idempotencyKey: 'idemp-uuid-999',
        items: [{ productId: 'prod-01', quantity: 1 }],
        payments: [{ paymentMethod: 'CASH', amount: 100 }],
      });

      expect(res.sale.id).toBe('sale-existing-01');
      expect(res.sale.idempotencyKey).toBe('idemp-uuid-999');
      // Must NOT allocate batches or deduct inventory on replayed sale
      expect(mockInventoryService.allocateBatchesForSale).not.toHaveBeenCalled();
      expect(mockInventoryService.recordMovementInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('negative-stock rule', () => {
    it('blocks checkout when branch disallows negative stock and inventory is insufficient', async () => {
      // 1. Shift
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'shift-01', shift_number: 1 }],
      });
      // 2. Branch with allow_negative_stock = false
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            code: 'BOLE01',
            name_en: 'Bole',
            settings: { allow_negative_stock: false },
          },
        ],
      });
      // 3. Term
      mockClient.query.mockResolvedValueOnce({
        rows: [{ code: 'POS01' }],
      });
      // 4. Sales count
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '0' }],
      });
      // 5. UUID
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'sale-neg-01' }],
      });
      // 6. Product
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'p-sugar',
            name_en: 'Wonji Sugar 1kg',
            base_price: '80.0000',
            cost_price: '65.0000',
            is_vat_applicable: true,
            vat_rate: '0.1500',
            effective_price: '80.0000',
          },
        ],
      });

      // Mock inventory service to throw BadRequestException on insufficient stock
      mockInventoryService.allocateBatchesForSale.mockRejectedValueOnce(
        new BadRequestException('Insufficient stock for product p-sugar. Current balance: 0, Change: -5'),
      );

      await expect(
        service.checkoutSale('b-01', 'cashier-01', {
          terminalId: 'term-01',
          shiftId: 'shift-01',
          items: [{ productId: 'p-sugar', quantity: 5 }],
          payments: [{ paymentMethod: 'CASH', amount: 400 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('held baskets persistence', () => {
    it('persists a held basket and resumes it from the database', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'held-uuid-01' }],
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'held-uuid-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            cashier_id: 'cashier-01',
            customer_identifier: 'Customer #4',
            cart_items: JSON.stringify([
              { productId: 'prod-01', name: 'Bread', quantity: 2, unitPrice: 20, discount: 0, lineTotal: 40, isVat: false },
            ]),
            subtotal: '40.0000',
            tax_total: '0.0000',
            grand_total: '40.0000',
            held_at: new Date('2026-10-21T11:00:00Z'),
            resumed_at: null,
          },
        ],
      });

      const held = await service.holdBasket('b-01', 'cashier-01', {
        terminalId: 'term-01',
        customerIdentifier: 'Customer #4',
        items: [
          { productId: 'prod-01', name: 'Bread', quantity: 2, unitPrice: 20, discount: 0, lineTotal: 40, isVat: false },
        ],
        subtotal: 40,
        taxTotal: 0,
        grandTotal: 40,
      });

      expect(held.id).toBe('held-uuid-01');
      expect(held.customerIdentifier).toBe('Customer #4');
      expect(held.grandTotal).toBe(40);
      expect(held.items).toHaveLength(1);

      // Now resume
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'held-uuid-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            cashier_id: 'cashier-01',
            customer_identifier: 'Customer #4',
            cart_items: JSON.stringify([
              { productId: 'prod-01', name: 'Bread', quantity: 2, unitPrice: 20, discount: 0, lineTotal: 40, isVat: false },
            ]),
            subtotal: '40.0000',
            tax_total: '0.0000',
            grand_total: '40.0000',
            held_at: new Date('2026-10-21T11:00:00Z'),
            resumed_at: new Date('2026-10-21T11:15:00Z'),
          },
        ],
      });

      const resumed = await service.resumeHeldBasket('b-01', 'held-uuid-01');
      expect(resumed.resumedAt).toBeDefined();
    });
  });

  describe('manager PIN verification', () => {
    it('authorizes supervisor with valid manager PIN', async () => {
      const bcrypt = await import('bcryptjs');
      const pinHash = bcrypt.hashSync('8822', 10);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'mgr-01',
            username: 'abebe.manager',
            full_name: 'Abebe Bikila',
            pin_hash: pinHash,
            quick_pin_hash: pinHash,
            role_name: 'BRANCH_MANAGER',
            max_discount_percentage: '25.00',
          },
        ],
      });

      const result = await service.verifyManagerPin('b-01', { pin: '8822' });
      expect(result.authorized).toBe(true);
      expect(result.authorizedBy).toBe('mgr-01');
      expect(result.role).toBe('BRANCH_MANAGER');
      expect(result.maxDiscountPercentage).toBe(25);
    });

    it('rejects incorrect manager PIN', async () => {
      const bcrypt = await import('bcryptjs');
      const pinHash = bcrypt.hashSync('8822', 10);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'mgr-01',
            username: 'abebe.manager',
            full_name: 'Abebe Bikila',
            pin_hash: pinHash,
            quick_pin_hash: pinHash,
            role_name: 'BRANCH_MANAGER',
            max_discount_percentage: '25.00',
          },
        ],
      });

      const result = await service.verifyManagerPin('b-01', { pin: '0000' });
      expect(result.authorized).toBe(false);
    });
  });

  describe('receipt reprint audit', () => {
    it('increments reprint count and logs to audit_logs', async () => {
      // 1. UPDATE sales reprint_count
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sale-01',
            branch_id: 'b-01',
            terminal_id: 'term-01',
            shift_id: 'shift-01',
            receipt_number: 'BOLE01-POS01-20261021-01-0001',
            cashier_id: 'cashier-01',
            subtotal: '100.0000',
            discount_total: '0.0000',
            taxable_subtotal: '86.9600',
            tax_exempt_subtotal: '0.0000',
            tax_total: '13.0400',
            grand_total: '100.0000',
            total_paid: '100.0000',
            change_given: '0.0000',
            payment_status: 'PAID',
            fiscal_status: 'FISCALIZED',
            fiscal_receipt_no: 'FRN-0001',
            fiscal_mrc: 'MOR-BOLE',
            reprint_count: 1,
            client_timestamp: new Date('2026-10-21T10:00:00Z'),
            server_timestamp: new Date('2026-10-21T10:00:01Z'),
            created_at: new Date('2026-10-21T10:00:01Z'),
          },
        ],
      });

      // 2. INSERT audit_logs
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 3. SELECT sale_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'item-01',
            item_name_snapshot: 'Test Item',
            quantity: '1',
            unit_price: '100.00',
            discount_amount: '0',
            line_total: '100.00',
            is_vat_applicable: true,
          },
        ],
      });

      // 4. SELECT sale_payments
      mockClient.query.mockResolvedValueOnce({
        rows: [{ payment_method: 'CASH', amount: '100.00', provider_reference: null }],
      });

      // 5. SELECT branches
      mockClient.query.mockResolvedValueOnce({
        rows: [{ code: 'BOLE01', name_en: 'Bole Store' }],
      });

      const res = await service.reprintReceipt('b-01', 'sale-01', 'cashier-01', {
        reason: 'Customer requested copy',
      });

      expect(res.reprintCount).toBe(1);
      expect(res.thermalReceipt).toContain('COPY #1');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining(['b-01', 'cashier-01', 'sale-01', expect.stringContaining('Customer requested copy')]),
      );
    });
  });
});

