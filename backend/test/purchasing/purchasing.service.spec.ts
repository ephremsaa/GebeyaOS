import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PurchasingService } from '../../src/modules/purchasing/purchasing.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';

describe('PurchasingService', () => {
  let service: PurchasingService;
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
      recordMovement: vi.fn().mockResolvedValue({} as any),
    };

    service = new PurchasingService(
      mockDb as DatabaseService,
      mockInventoryService as InventoryService,
    );
  });

  describe('createPurchaseOrder', () => {
    it('creates a PO and items with proper financial totals', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'po-1',
              order_number: 'PO-12345678',
              status: 'ISSUED',
              subtotal: 1000.0,
              tax_total: 150.0,
              grand_total: 1150.0,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // insert PO item

      const result = await service.createPurchaseOrder('user-1', {
        branch_id: 'branch-1',
        supplier_id: 'supplier-1',
        items: [
          {
            product_id: 'prod-1',
            ordered_quantity: 10,
            unit_cost: 100.0,
            tax_rate: 0.15,
          },
        ],
      });

      expect(result.order_number).toBe('PO-12345678');
      expect(result.grand_total).toBe(1150.0);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('processGrn', () => {
    it('processes GRN, apportions landed freight costs, generates batches, and updates product AVCO', async () => {
      // 1. Insert GRN
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'grn-1',
            grn_number: 'GRN-12345678',
            total_received_cost: 11000.0,
          },
        ],
      });

      // 2. Insert grn_item
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      });

      // 3. Upsert batch
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'batch-new-1' }],
      });

      // 4. Products query for current cost
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ cost_price: '90.0000' }],
      });

      // 5. Stock ledger prior balance query
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ balance_after: '10.000' }],
      });

      // 6. Products update new AVCO
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [],
      });

      const grnResult = await service.processGrn('user-1', {
        branch_id: 'branch-1',
        supplier_id: 'supplier-1',
        landed_freight_cost: 1000.0, // 1,000 ETB freight
        items: [
          {
            product_id: 'prod-1',
            batch_number: 'LOT-9988',
            expiry_date: '2027-01-01',
            received_quantity: 100,
            purchase_unit_cost: 100.0, // 100 * 100 = 10,000 ETB + 1,000 freight = 11,000 ETB (110 ETB/unit)
          },
        ],
      });

      expect(grnResult.total_landed_cost).toBe(1000.0);
      expect(grnResult.withholding_tax).toBe(220.0); // 2% of 11,000 ETB
      expect(mockInventoryService.recordMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'PURCHASE_RECEIVE',
          quantityChange: 100,
          unitCost: 110.0,
        }),
        mockClient,
      );
    });
  });

  describe('queries & status updates', () => {
    it('lists purchase orders with item counts', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'po-1',
            order_number: 'PO-12345678',
            supplier_name: 'Almaz Agro',
            supplier_code: 'SUP-ALMAZ',
            item_count: '3',
            grand_total: '15000.0000',
          },
        ],
      });

      const list = await service.listPurchaseOrders('branch-1');
      expect(list).toHaveLength(1);
      expect(list[0].order_number).toBe('PO-12345678');
      expect(list[0].item_count).toBe('3');
    });

    it('retrieves single purchase order with line items', async () => {
      mockDb.query = vi
        .fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              id: 'po-1',
              order_number: 'PO-12345678',
              supplier_name: 'Almaz Agro',
            },
          ],
        })
        .mockResolvedValueOnce({
          rowCount: 2,
          rows: [
            { id: 'poi-1', product_id: 'prod-1', ordered_quantity: '50.000', name_en: 'Milk' },
            { id: 'poi-2', product_id: 'prod-2', ordered_quantity: '20.000', name_en: 'Oil' },
          ],
        });

      const po = await service.getPurchaseOrderById('po-1');
      expect(po.order_number).toBe('PO-12345678');
      expect(po.items).toHaveLength(2);
      expect(po.items[0].name_en).toBe('Milk');
    });

    it('updates purchase order status', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'po-1', status: 'ISSUED' }],
      });

      const updated = await service.updatePOStatus('po-1', 'ISSUED');
      expect(updated.status).toBe('ISSUED');
    });

    it('lists goods received notes', async () => {
      mockDb.query = vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'grn-1',
            grn_number: 'GRN-12345678',
            supplier_name: 'Almaz Agro',
            total_received_cost: '11000.0000',
            item_count: '1',
          },
        ],
      });

      const grns = await service.listGRNs('branch-1');
      expect(grns).toHaveLength(1);
      expect(grns[0].grn_number).toBe('GRN-12345678');
    });
  });
});
