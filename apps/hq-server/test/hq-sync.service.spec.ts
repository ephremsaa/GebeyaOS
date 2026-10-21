import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HqSyncService } from '../src/modules/hq-sync/hq-sync.service';
import { DatabaseService } from '../src/common/database/database.service';
import {
  SyncBatchPushRequest,
  PacketBuilder,
} from '@gebeyaos/sync-protocol';

describe('Central HQ Sync Engine', () => {
  let service: HqSyncService;
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

    service = new HqSyncService(mockDb as unknown as DatabaseService);
  });

  describe('processBranchPush', () => {
    it('accepts branch SALE event and ingests into sync_inbox with APPLIED_BRANCH', async () => {
      const saleEvent = PacketBuilder.buildSyncEvent(
        'b-01',
        'SALE',
        'sale-uuid-01',
        'CREATED',
        { receiptNumber: 'BOLE01-POS01-20261021-01-0001', grandTotal: 500 },
      );

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // insert into sync_inbox

      const req: SyncBatchPushRequest = {
        sourceBranchId: 'b-01',
        batchId: 'batch-01',
        events: [saleEvent],
      };

      const res = await service.processBranchPush(req);

      expect(res.success).toBe(true);
      expect(res.acknowledgedEventIds).toContain(saleEvent.id);
      expect(res.conflicts).toHaveLength(0);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_inbox'),
        expect.arrayContaining([
          'b-01',
          saleEvent.id,
          saleEvent.idempotencyKey,
          'SALE',
          'CREATED',
          'APPLIED_BRANCH',
        ]),
      );
    });

    it('rejects branch attempt to mutate master PRODUCT catalog (APPLIED_HQ conflict)', async () => {
      const prodEvent = PacketBuilder.buildSyncEvent(
        'b-01',
        'PRODUCT',
        'prod-uuid-01',
        'UPDATED',
        { nameEn: 'Unauthorized Name Change' },
      );

      const req: SyncBatchPushRequest = {
        sourceBranchId: 'b-01',
        batchId: 'batch-02',
        events: [prodEvent],
      };

      const res = await service.processBranchPush(req);

      expect(res.acknowledgedEventIds).toHaveLength(0);
      expect(res.failedEventIds).toContain(prodEvent.id);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].policy).toBe('APPLIED_HQ');
      expect(res.conflicts[0].reason).toContain('HQ is solely authoritative');

      // Ensure sync_inbox was NOT written for rejected event
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('guarantees idempotency on duplicate packet transmission', async () => {
      const shiftEvent = PacketBuilder.buildSyncEvent(
        'b-01',
        'SHIFT',
        'shift-uuid-01',
        'CREATED',
        { shiftNumber: 1, openingFloat: 1000 },
      );

      // On conflict do update processed_at
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const req: SyncBatchPushRequest = {
        sourceBranchId: 'b-01',
        batchId: 'batch-03',
        events: [shiftEvent],
      };

      const res = await service.processBranchPush(req);

      expect(res.acknowledgedEventIds).toContain(shiftEvent.id);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (idempotency_key) DO UPDATE'),
        expect.anything(),
      );
    });
  });

  describe('getCatalogDeltas', () => {
    it('returns categories, products, and suppliers modified since lastSyncedAt', async () => {
      // 1. Categories
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-01',
            code: 'GROCERY',
            name_en: 'Packaged Grocery',
            name_am: 'የታሸጉ ምግቦች',
            is_active: true,
            updated_at: new Date('2026-10-21T08:00:00Z'),
          },
        ],
      });

      // 2. Products
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'prod-01',
            sku: 'SKU-01',
            name_en: 'Teff Flour 5KG',
            name_am: 'የጤፍ ዱቄት 5 ኪ.ግ',
            category_id: 'cat-01',
            uom_code: 'BAG',
            base_price: '650.0000',
            cost_price: '500.0000',
            is_vat_applicable: false,
            vat_rate: '0.0000',
            is_weighed: false,
            scale_plu: null,
            min_stock_level: '10.000',
            is_active: true,
            updated_at: new Date('2026-10-21T08:30:00Z'),
          },
        ],
      });

      // 3. Suppliers
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'sup-01',
            code: 'SUP-TEFF',
            name: 'Adaa Teff Farmers Union',
            tin_number: '0011223344',
            vat_number: null,
            contact_person: 'Chala D.',
            phone: '+251 91 123 4567',
            email: 'adaa@teff.et',
            address: 'Bishoftu',
            payment_terms_days: 15,
            is_active: true,
            updated_at: new Date('2026-10-21T09:00:00Z'),
          },
        ],
      });

      const response = await service.getCatalogDeltas(
        'b-01',
        '2026-10-20T00:00:00Z',
      );

      expect(response.deltas).toHaveLength(3);
      expect(response.deltas[0].aggregateType).toBe('CATEGORY');
      expect(response.deltas[1].aggregateType).toBe('PRODUCT');
      expect(response.deltas[2].aggregateType).toBe('SUPPLIER');
    });
  });
});
