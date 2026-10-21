import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductsService } from '../../src/modules/products/products.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockDb: Partial<DatabaseService>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(),
    };
    service = new ProductsService(mockDb as DatabaseService);
  });

  describe('createProduct', () => {
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

      (mockDb.query as any).mockResolvedValueOnce({
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
  });

  describe('lookupBarcode - Standard Barcode with Pack Multiplier', () => {
    it('resolves product and applies carton pack multiplier to price', async () => {
      const branchId = '018e0000-0000-7000-8000-000000000020';
      const barcode = '6281006560027';

      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-1',
            sku: 'BISCUIT-CHOC-CARTON',
            name_en: 'Chocolate Biscuits Pack of 24',
            base_price: '25.0000',
            pack_multiplier: 24,
            is_vat_applicable: true,
            vat_rate: '0.1500',
            override_price: null,
          },
        ],
      });

      const scanResult = await service.lookupBarcode(branchId, barcode);

      expect(scanResult.isScaleBarcode).toBe(false);
      expect(scanResult.packMultiplier).toBe(24);
      expect(scanResult.effectiveUnitPrice).toBe(600.0);
      expect(scanResult.lineTotal).toBe(600.0);
      expect(scanResult.taxAmount).toBeCloseTo(78.26, 2);
    });
  });

  describe('lookupBarcode - Deli Scale Weighed Item', () => {
    it('extracts weight from barcode and computes total line price', async () => {
      const branchId = '018e0000-0000-7000-8000-000000000020';
      const scaleBarcode = '2000123015002'; // PLU: 00123, 1.500 kg

      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'prod-meat',
            sku: 'BEEF-BONELESS',
            name_en: 'Boneless Beef',
            scale_plu: '00123',
            base_price: '500.0000',
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
      expect(scanResult.lineTotal).toBe(750.0);
    });
  });
});
