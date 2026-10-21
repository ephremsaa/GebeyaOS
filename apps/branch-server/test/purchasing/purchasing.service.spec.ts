import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchasingService } from '../../src/modules/purchasing/purchasing.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('PurchasingService', () => {
  let service: PurchasingService;
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
      recordMovementInTransaction: vi.fn().mockResolvedValue({
        id: 'ledger-grn-01',
        balanceAfter: 150,
      }),
    };

    service = new PurchasingService(
      mockDb as unknown as DatabaseService,
      mockInventoryService as unknown as InventoryService,
    );
  });

  describe('createSupplier', () => {
    it('creates supplier with valid TIN and payment terms', async () => {
      // 1. Check existing code
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      // 2. Insert
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sup-01',
            code: 'SUP-ALMAZ',
            name: 'Almaz Agro Industries',
            tin_number: '0098765432',
            vat_number: 'ETH-VAT-999',
            contact_person: 'Almaz T.',
            phone: '+251 91 100 2233',
            email: 'almaz@agro.et',
            address: 'Bishoftu Industrial Zone',
            payment_terms_days: 30,
            is_active: true,
            created_at: new Date('2026-10-21T09:00:00Z'),
            updated_at: new Date('2026-10-21T09:00:00Z'),
          },
        ],
      });

      const supplier = await service.createSupplier({
        code: 'sup-almaz',
        name: 'Almaz Agro Industries',
        tinNumber: '0098765432',
        vatNumber: 'ETH-VAT-999',
        contactPerson: 'Almaz T.',
        phone: '+251 91 100 2233',
        email: 'almaz@agro.et',
        address: 'Bishoftu Industrial Zone',
        paymentTermsDays: 30,
      });

      expect(supplier.id).toBe('sup-01');
      expect(supplier.code).toBe('SUP-ALMAZ');
      expect(supplier.tinNumber).toBe('0098765432');
      expect(supplier.paymentTermsDays).toBe(30);
    });

    it('rejects duplicate supplier code with ConflictException', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'existing-sup' }],
      });

      await expect(
        service.createSupplier({
          code: 'SUP-ALMAZ',
          name: 'Another Supplier',
          phone: '+251 91 000 0000',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createPurchaseOrder', () => {
    it('generates PO with item tax calculations and sequential order number', async () => {
      // 1. Verify supplier
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'sup-01' }],
      });

      // 2. Count for order number
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '4' }],
      });

      // 3. Insert purchase_orders header
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'po-01',
            branch_id: 'b-01',
            order_number: 'PO-20261021-0005',
            supplier_id: 'sup-01',
            status: 'DRAFT',
            expected_delivery_date: new Date('2026-10-25'),
            subtotal: '10000.0000',
            tax_total: '1500.0000',
            grand_total: '11500.0000',
            notes: 'Weekly fresh milk delivery',
            created_by: 'purchaser-01',
            created_at: new Date('2026-10-21T10:00:00Z'),
            updated_at: new Date('2026-10-21T10:00:00Z'),
          },
        ],
      });

      // 4. Insert purchase_order_items
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'poi-01',
            purchase_order_id: 'po-01',
            product_id: 'p-milk',
            ordered_quantity: '100.000',
            received_quantity: '0.000',
            unit_cost: '100.0000',
            tax_rate: '0.1500',
            total_cost: '11500.0000',
          },
        ],
      });

      const po = await service.createPurchaseOrder('b-01', 'purchaser-01', {
        supplierId: 'sup-01',
        expectedDeliveryDate: '2026-10-25',
        notes: 'Weekly fresh milk delivery',
        items: [
          {
            productId: 'p-milk',
            orderedQuantity: 100,
            unitCost: 100,
            taxRate: 0.15,
          },
        ],
      });

      expect(po.orderNumber).toBe('PO-20261021-0005');
      expect(po.grandTotal).toBe(11500);
      expect(po.items).toHaveLength(1);
      expect(po.items![0].orderedQuantity).toBe(100);
    });
  });

  describe('createGRN', () => {
    it('receives goods, apportions landed cost, updates AVCO, creates batches, and completes linked PO', async () => {
      // 1. Verify supplier (has TIN)
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sup-01',
            name: 'Almaz Agro',
            tin_number: '0098765432',
          },
        ],
      });

      // 2. Count for GRN number
      mockClient.query.mockResolvedValueOnce({
        rows: [{ count: '2' }],
      });

      // 3. Insert goods_received_notes
      // 100 units at 100 ETB = 10,000 ETB + 1,000 freight = 11,000 ETB total received
      // Withholding Tax = 2% of 11,000 = 220 ETB
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'grn-01',
            branch_id: 'b-01',
            grn_number: 'GRN-20261021-0003',
            purchase_order_id: 'po-01',
            supplier_id: 'sup-01',
            supplier_invoice_no: 'INV-7890',
            supplier_invoice_date: new Date('2026-10-21'),
            landed_freight_cost: '1000.0000',
            landed_other_cost: '0.0000',
            total_received_cost: '11000.0000',
            withholding_tax_amount: '220.0000',
            received_by: 'receiver-01',
            created_at: new Date('2026-10-21T11:00:00Z'),
          },
        ],
      });

      // 4. Insert grn_items (apportioned final unit cost: 100 + 1000/100 = 110 ETB)
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'grn-item-01',
            grn_id: 'grn-01',
            product_id: 'p-milk',
            batch_number: 'BATCH-MILK-001',
            expiry_date: new Date('2026-11-20'),
            received_quantity: '100.000',
            purchase_unit_cost: '100.0000',
            apportioned_landed_cost: '1000.0000',
            final_unit_cost: '110.0000',
            created_at: new Date('2026-10-21T11:00:00Z'),
          },
        ],
      });

      // 5. Insert or update batches
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'batch-milk-001' }],
      });

      // 6. Query product current cost (e.g. 90 ETB)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ cost_price: '90.0000' }],
      });

      // 7. Query on hand stock from latest ledger (e.g. 50 units on hand)
      mockClient.query.mockResolvedValueOnce({
        rows: [{ balance_after: '50.000' }],
      });

      // (recordMovementInTransaction is mocked)

      // 8. Update product cost_price with new AVCO:
      // (50 * 90 + 100 * 110) / 150 = (4500 + 11000) / 150 = 15500 / 150 = 103.3333 ETB
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 9. Update purchase_order_items received_quantity
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // 10. Check if PO is completed
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ordered_quantity: '100.000', received_quantity: '100.000' }],
      });

      // 11. Update purchase_orders status = 'COMPLETED'
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const grn = await service.createGRN('b-01', 'receiver-01', {
        supplierId: 'sup-01',
        purchaseOrderId: 'po-01',
        supplierInvoiceNo: 'INV-7890',
        landedFreightCost: 1000,
        items: [
          {
            productId: 'p-milk',
            batchNumber: 'BATCH-MILK-001',
            expiryDate: '2026-11-20',
            receivedQuantity: 100,
            purchaseUnitCost: 100,
          },
        ],
      });

      expect(grn.grnNumber).toBe('GRN-20261021-0003');
      expect(grn.totalReceivedCost).toBe(11000);
      expect(grn.withholdingTaxAmount).toBe(220); // 2%
      expect(grn.items).toHaveLength(1);
      expect(grn.items![0].finalUnitCost).toBe(110);

      // Verify stock movement was recorded as PURCHASE_RECEIVE
      expect(mockInventoryService.recordMovementInTransaction).toHaveBeenCalledWith(
        mockClient,
        'b-01',
        expect.objectContaining({
          productId: 'p-milk',
          movementType: 'PURCHASE_RECEIVE',
          quantityChange: 100,
          unitCost: 110,
        }),
      );

      // Verify product cost was updated to the blended AVCO (103.3333)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE products'),
        [103.3333, 'p-milk'],
      );

      // Verify PO status was marked COMPLETED
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE purchase_orders'),
        ['COMPLETED', 'po-01'],
      );
    });
  });
});
