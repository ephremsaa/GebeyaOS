import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InventoryService } from '../../src/modules/inventory/inventory.service';

describe('InventoryService – Expiry List, Clearance Markdown & Bulk Write-off', () => {
  let service: InventoryService;
  let mockDb: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockDb)),
    };
    service = new InventoryService(mockDb);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getExpiryList', () => {
    it('aggregates summary cards (expired, 7d, 30d, 90d) and computes valueAtRisk', async () => {
      const today = '2026-11-15';

      // 4 sample batches:
      // b1: Expired (-5 days) -> 10 units @ 100 ETB = 1000 ETB
      // b2: 5 days left (7d) -> 20 units @ 50 ETB = 1000 ETB
      // b3: 20 days left (30d) -> 15 units @ 40 ETB = 600 ETB
      // b4: 60 days left (90d) -> 50 units @ 30 ETB = 1500 ETB
      // b5: 120 days left (OK) -> 100 units @ 20 ETB = 2000 ETB
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            batch_id: 'b-1',
            batch_number: 'B001',
            product_id: 'p-1',
            product_name: 'Fresh Milk',
            product_name_am: 'ወተት',
            sku: 'MILK-01',
            uom_code: 'PACK',
            base_price: 130,
            photo_path: '/uploads/milk.webp',
            category_id: 'cat-dairy',
            category_name: 'Dairy',
            category_name_am: 'ወተት እና የወተት ተዋጽኦ',
            supplier_id: 'sup-1',
            supplier_name: 'Mama Dairy',
            current_quantity: '10',
            unit_cost: '100',
            expiry_date: '2026-11-10', // -5 days (Expired)
            received_date: '2026-10-01',
            clearance_price: null,
          },
          {
            batch_id: 'b-2',
            batch_number: 'B002',
            product_id: 'p-2',
            product_name: 'Yogurt 500g',
            product_name_am: 'እርጎ',
            sku: 'YOG-02',
            uom_code: 'PACK',
            base_price: 70,
            photo_path: null,
            category_id: 'cat-dairy',
            category_name: 'Dairy',
            category_name_am: 'ወተት እና የወተት ተዋጽኦ',
            supplier_id: 'sup-1',
            supplier_name: 'Mama Dairy',
            current_quantity: '20',
            unit_cost: '50',
            expiry_date: '2026-11-20', // +5 days (Within 7d)
            received_date: '2026-10-05',
            clearance_price: '45.00',
          },
          {
            batch_id: 'b-3',
            batch_number: 'B003',
            product_id: 'p-3',
            product_name: 'Soft Bread',
            product_name_am: 'ዳቦ',
            sku: 'BRD-03',
            uom_code: 'PCS',
            base_price: 55,
            photo_path: null,
            category_id: 'cat-bakery',
            category_name: 'Bakery',
            supplier_id: 'sup-2',
            supplier_name: 'Addis Bakery',
            current_quantity: '15',
            unit_cost: '40',
            expiry_date: '2026-12-05', // +20 days (Within 30d)
            received_date: '2026-10-10',
            clearance_price: null,
          },
          {
            batch_id: 'b-4',
            batch_number: 'B004',
            product_id: 'p-4',
            product_name: 'Fruit Jam',
            product_name_am: 'ጃም',
            sku: 'JAM-04',
            uom_code: 'JAR',
            base_price: 45,
            photo_path: null,
            category_id: 'cat-grocery',
            category_name: 'Grocery',
            supplier_id: 'sup-3',
            supplier_name: 'Fresh Harvest',
            current_quantity: '50',
            unit_cost: '30',
            expiry_date: '2027-01-14', // +60 days (Within 90d)
            received_date: '2026-09-01',
            clearance_price: null,
          },
          {
            batch_id: 'b-5',
            batch_number: 'B005',
            product_id: 'p-5',
            product_name: 'White Rice 5kg',
            product_name_am: 'ሩዝ',
            sku: 'RIC-05',
            uom_code: 'BAG',
            base_price: 25,
            photo_path: null,
            category_id: 'cat-grocery',
            category_name: 'Grocery',
            supplier_id: 'sup-3',
            supplier_name: 'Fresh Harvest',
            current_quantity: '100',
            unit_cost: '20',
            expiry_date: '2027-03-15', // +120 days (OK)
            received_date: '2026-08-01',
            clearance_price: null,
          },
        ],
      });

      const res = await service.getExpiryList('branch-01', { warningDays: 90 });

      expect(res.totalCount).toBe(5);
      expect(res.summary.expiredCount).toBe(1);
      expect(res.summary.expiredCostValue).toBe(1000); // 10 * 100
      expect(res.summary.within7dCount).toBe(1);
      expect(res.summary.within7dCostValue).toBe(1000); // 20 * 50
      expect(res.summary.within30dCount).toBe(1);
      expect(res.summary.within30dCostValue).toBe(600); // 15 * 40
      expect(res.summary.within90dCount).toBe(1);
      expect(res.summary.within90dCostValue).toBe(1500); // 50 * 30

      // Value at risk = 1000 + 1000 + 600 + 1500 = 4100 ETB
      expect(res.summary.valueAtRisk).toBe(4100);
    });

    it('filters batches by status = "expired"', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            batch_id: 'b-1',
            batch_number: 'B001',
            product_id: 'p-1',
            product_name: 'Fresh Milk',
            current_quantity: '10',
            unit_cost: '100',
            expiry_date: '2026-11-10', // Expired
          },
          {
            batch_id: 'b-2',
            batch_number: 'B002',
            product_id: 'p-2',
            product_name: 'Yogurt',
            current_quantity: '20',
            unit_cost: '50',
            expiry_date: '2026-11-20', // Unexpired
          },
        ],
      });

      const res = await service.getExpiryList('branch-01', { status: 'expired' });
      expect(res.batches).toHaveLength(1);
      expect(res.batches[0].batchId).toBe('b-1');
    });
  });

  describe('setBatchClearancePrice', () => {
    it('updates batch markdown clearance price, date range, and reason', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'b-2', branch_id: 'b-01', current_quantity: '20' }] }) // check
        .mockResolvedValueOnce({ rows: [] }); // update

      const res = await service.setBatchClearancePrice(
        'b-01',
        'b-2',
        {
          clearancePrice: 35.5,
          startDate: '2026-11-15',
          endDate: '2026-11-25',
          reason: 'Expiring in 5 days clearance sale',
        },
        'user-manager',
      );

      expect(res.success).toBe(true);
      expect(res.clearancePrice).toBe(35.5);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE batches'),
        expect.arrayContaining([35.5, '2026-11-15', '2026-11-25', 'Expiring in 5 days clearance sale']),
      );
    });

    it('rejects non-positive clearance price', async () => {
      await expect(
        service.setBatchClearancePrice(
          'b-01',
          'b-2',
          {
            clearancePrice: 0,
            startDate: '2026-11-15',
            endDate: '2026-11-25',
            reason: 'Invalid price',
          },
          'user-manager',
        ),
      ).rejects.toThrow(/positive/);
    });
  });

  describe('bulkWriteOffExpiredBatches', () => {
    it('writes off selected batches, posts stock adjustment with reason EXPIRED, and resolves notifications', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'b-exp-1', product_id: 'p-1', current_quantity: '10', unit_cost: '50' },
            { id: 'b-exp-2', product_id: 'p-2', current_quantity: '5', unit_cost: '80' },
          ],
        }) // 1. query batches
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // 2. countRes for adjustment number
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'adj-01',
              adjustment_number: 'ADJ-001',
              branch_id: 'b-01',
              reason_code: 'EXPIRED',
              notes: 'Periodic expired disposal',
              status: 'COMPLETED',
              approved_by: 'user-manager',
              created_by: 'user-manager',
              created_at: new Date(),
            },
          ],
        }) // 3. insert stock_adjustments
        // Item 1
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'adj-item-1',
              adjustment_id: 'adj-01',
              product_id: 'p-1',
              batch_id: 'b-exp-1',
              quantity_change: '-10',
              unit_cost: '50',
              created_at: new Date(),
            },
          ],
        }) // 4. insert item 1
        .mockResolvedValueOnce({ rows: [] }) // 5. advisory lock item 1
        .mockResolvedValueOnce({ rows: [{ balance_after: '100' }] }) // 6. select balance_after item 1
        .mockResolvedValueOnce({ rows: [{ current_quantity: '0' }] }) // 7. update batch 1
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ledger-01',
              branch_id: 'b-01',
              product_id: 'p-1',
              batch_id: 'b-exp-1',
              movement_type: 'EXPIRED',
              quantity_change: '-10',
              unit_cost: '50',
              balance_after: '90',
              reference_type: 'ADJUSTMENT',
              reference_id: 'adj-01',
              notes: 'EXPIRED: Periodic expired disposal',
              created_by: 'user-manager',
              created_at: new Date(),
            },
          ],
        }) // 8. insert ledger 1
        // Item 2
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'adj-item-2',
              adjustment_id: 'adj-01',
              product_id: 'p-2',
              batch_id: 'b-exp-2',
              quantity_change: '-5',
              unit_cost: '80',
              created_at: new Date(),
            },
          ],
        }) // 9. insert item 2
        .mockResolvedValueOnce({ rows: [] }) // 10. advisory lock item 2
        .mockResolvedValueOnce({ rows: [{ balance_after: '50' }] }) // 11. select balance_after item 2
        .mockResolvedValueOnce({ rows: [{ current_quantity: '0' }] }) // 12. update batch 2
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ledger-02',
              branch_id: 'b-01',
              product_id: 'p-2',
              batch_id: 'b-exp-2',
              movement_type: 'EXPIRED',
              quantity_change: '-5',
              unit_cost: '80',
              balance_after: '45',
              reference_type: 'ADJUSTMENT',
              reference_id: 'adj-01',
              notes: 'EXPIRED: Periodic expired disposal',
              created_by: 'user-manager',
              created_at: new Date(),
            },
          ],
        }) // 13. insert ledger 2
        // Update notifications
        .mockResolvedValueOnce({ rows: [] }); // 14. update notifications

      const res = await service.bulkWriteOffExpiredBatches(
        'b-01',
        ['b-exp-1', 'b-exp-2'],
        'Periodic expired disposal',
        'user-manager',
      );

      expect(res.success).toBe(true);
      expect(res.batchesCount).toBe(2);
      expect(res.totalCostValue).toBe(10 * 50 + 5 * 80); // 900 ETB
    });
  });
});
