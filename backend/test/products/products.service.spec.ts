import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from '../../src/modules/products/products.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
    service = new ProductsService(mockDb as DatabaseService);
  });

  describe('createProduct & barcode uniqueness', () => {
    it('successfully inserts a new product with defaults', async () => {
      const mockProduct = {
        id: '018e0000-0000-7000-8000-000000000001',
        sku: 'OIL-SUN-5L',
        name_en: 'Sunflower Cooking Oil 5L',
        name_am: 'የሱፍ ዘይት 5 ሊትር',
        category_id: '018e0000-0000-7000-8000-000000000055',
        uom_code: 'L',
        base_price: 1150.0,
        cost_price: 950.0,
        is_vat_applicable: true,
        vat_rate: 0.15,
        is_weighed: false,
        scale_plu: null,
        min_stock_level: 10,
        max_stock_level: 100,
        allow_discount: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [mockProduct],
      });

      const result = await service.createProduct({
        sku: 'OIL-SUN-5L',
        name_en: 'Sunflower Cooking Oil 5L',
        name_am: 'የሱፍ ዘይት 5 ሊትር',
        category_id: '018e0000-0000-7000-8000-000000000055',
        uom_code: 'L',
        base_price: 1150.0,
        cost_price: 950.0,
      });

      expect(result.sku).toBe('OIL-SUN-5L');
      expect(result.base_price).toBe(1150.0);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException on duplicate SKU', async () => {
      mockDb.query.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.createProduct({
          sku: 'EXISTING-SKU',
          name_en: 'Test Product',
          category_id: 'cat-1',
          uom_code: 'PCS',
          base_price: 100,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on duplicate barcode', async () => {
      // product exists query
      mockDb.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'prod-1' }] });
      // barcode insert query throws 23505
      mockDb.query.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.addBarcode('prod-1', {
          barcode: '6281006560027',
          barcode_type: 'EAN13',
          pack_multiplier: 1.0,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('checkBarcode reports existing product and duplicate status accurately', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-1',
            sku: 'BISCUIT-CHOC',
            name_en: 'Chocolate Biscuits',
            name_am: 'ቸኮሌት ብስኩት',
            pack_multiplier: '1.000',
          },
        ],
      });

      const res = await service.checkBarcode('6281006560027');
      expect(res.exists).toBe(true);
      expect(res.product?.sku).toBe('BISCUIT-CHOC');

      mockDb.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const resNonExistent = await service.checkBarcode('9999999999999');
      expect(resNonExistent.exists).toBe(false);
      expect(resNonExistent.product).toBeNull();
    });
  });

  describe('unit conversion - Pack Multiplier Resolution', () => {
    it('resolves product and applies carton pack multiplier to price', async () => {
      const branchId = '018e0000-0000-7000-8000-000000000020';
      const barcode = '6281006560027';

      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-1',
            sku: 'BISCUIT-CHOC-CARTON',
            name_en: 'Chocolate Biscuits Pack of 24',
            base_price: '25.0000', // 25 ETB per piece
            pack_multiplier: 24, // Carton of 24 = 600 ETB
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
          },
        ],
      });

      const scanResult = await service.lookupBarcode(branchId, barcode);

      expect(scanResult.isScaleBarcode).toBe(false);
      expect(scanResult.packMultiplier).toBe(24);
      expect(scanResult.effectiveUnitPrice).toBe(600.0); // 25 * 24
      expect(scanResult.lineTotal).toBe(600.0);
      expect(scanResult.taxAmount).toBeCloseTo(78.26, 2);
    });

    it('extracts weight from deli scale barcode and computes total line price', async () => {
      const branchId = '018e0000-0000-7000-8000-000000000020';
      // 20-00123-01500-2 => PLU: 00123, Weight: 1.500 kg
      const scaleBarcode = '2000123015002';

      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-meat',
            sku: 'BEEF-BONELESS',
            name_en: 'Boneless Beef',
            scale_plu: '00123',
            base_price: '500.0000', // 500 ETB / kg
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
          },
        ],
      });

      const scanResult = await service.lookupBarcode(branchId, scaleBarcode);

      expect(scanResult.isScaleBarcode).toBe(true);
      expect(scanResult.quantity).toBe(1.5);
      expect(scanResult.effectiveUnitPrice).toBe(500.0);
      expect(scanResult.lineTotal).toBe(750.0); // 1.5 * 500
    });
  });

  describe('override precedence - Branch Price vs Master Base Price', () => {
    const branchId = 'branch-addis-01';

    it('uses branch override price and tax settings when active override exists', async () => {
      const barcode = '6001234567890';
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-juice',
            sku: 'JUICE-MANGO-1L',
            name_en: 'Mango Juice 1L',
            base_price: '120.0000', // Master HQ base price
            pack_multiplier: 1.0,
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: '145.0000', // Branch override price
            override_vat_applicable: false, // Branch VAT exemption override
            override_vat_rate: '0.0000',
          },
        ],
      });

      const result = await service.lookupBarcode(branchId, barcode);

      expect(result.isBranchOverride).toBe(true);
      expect(result.basePrice).toBe(120.0);
      expect(result.effectiveUnitPrice).toBe(145.0);
      expect(result.isVatApplicable).toBe(false);
      expect(result.taxAmount).toBe(0.0);
      expect(result.lineTotal).toBe(145.0);
    });

    it('falls back to master base price when branch override is not set', async () => {
      const barcode = '6001234567890';
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-juice',
            sku: 'JUICE-MANGO-1L',
            name_en: 'Mango Juice 1L',
            base_price: '120.0000',
            pack_multiplier: 1.0,
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
            override_vat_applicable: null,
            override_vat_rate: null,
          },
        ],
      });

      const result = await service.lookupBarcode(branchId, barcode);

      expect(result.isBranchOverride).toBe(false);
      expect(result.basePrice).toBe(120.0);
      expect(result.effectiveUnitPrice).toBe(120.0);
      expect(result.isVatApplicable).toBe(true);
      expect(result.taxAmount).toBeCloseTo(15.65, 2);
    });
  });

  describe('price history & audit trail', () => {
    it('records price change in price_change_logs and updates master catalog', async () => {
      // 1. SELECT base_price FOR UPDATE
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ base_price: '100.00' }],
      });
      // 2. UPDATE products SET base_price
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      // 3. INSERT INTO price_change_logs
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.updatePrice('prod-1', {
        new_price: 125.0,
        reason: 'Inflation adjustment',
        changed_by: 'manager-user-id',
      });

      expect(res.old_price).toBe(100.0);
      expect(res.new_price).toBe(125.0);

      // Verify price_change_logs insert
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO price_change_logs'),
        expect.arrayContaining([expect.any(String), 'prod-1', null, 100.0, 125.0, 'Inflation adjustment', 'manager-user-id']),
      );
    });

    it('retrieves price change history ordered by timestamp', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 2,
        rows: [
          {
            id: 'log-2',
            product_id: 'prod-1',
            old_price: 100.0,
            new_price: 125.0,
            reason: 'Inflation adjustment',
            created_at: new Date('2026-10-26T10:00:00Z'),
          },
          {
            id: 'log-1',
            product_id: 'prod-1',
            old_price: 80.0,
            new_price: 100.0,
            reason: 'Supplier cost increase',
            created_at: new Date('2026-09-01T08:00:00Z'),
          },
        ],
      });

      const history = await service.getPriceHistory('prod-1', 'branch-1');
      expect(history.length).toBe(2);
      expect(history[0].new_price).toBe(125.0);
      expect(history[1].new_price).toBe(100.0);
    });
  });

  describe('archive product & stock warning', () => {
    it('warns when archiving a product that has stock on hand', async () => {
      // 1. Stock check query
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ stock: '45.000' }],
      });
      // 2. Archive UPDATE query
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'prod-1', is_active: false, name_en: 'Cooking Oil' }],
      });
      // 3. Outbox event query
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.archiveProduct('prod-1', 'branch-1');

      expect(res.product.is_active).toBe(false);
      expect(res.stockOnHand).toBe(45);
      expect(res.warning).toContain('Product has 45 units in stock');
    });

    it('archives cleanly without warning when stock is zero', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ stock: '0' }],
      });
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'prod-2', is_active: false, name_en: 'Empty Item' }],
      });
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.archiveProduct('prod-2', 'branch-1');
      expect(res.stockOnHand).toBe(0);
      expect(res.warning).toBeUndefined();
    });
  });
});

