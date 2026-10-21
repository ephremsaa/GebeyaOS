import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncInboxService } from '../../src/modules/sync/sync-inbox.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('SyncInboxService', () => {
  let service: SyncInboxService;
  let mockDb: Partial<DatabaseService>;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };

    service = new SyncInboxService(mockDb as DatabaseService);
  });

  describe('ingestBranchBatch - Idempotency & Deduplication', () => {
    it('acknowledges duplicate events safely without re-applying mutations', async () => {
      // Mock existing record in sync_inbox
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'inbox-1', status: 'PROCESSED' }],
      });

      const response = await service.ingestBranchBatch({
        branchId: 'branch-1',
        batchTimestamp: new Date().toISOString(),
        events: [
          {
            eventId: 'ev-dup-1',
            sequenceNo: 50,
            entityType: 'SALE',
            entityId: 'sale-1',
            operation: 'INSERT',
            idempotencyKey: 'branch-1_SALE_sale-1_INSERT_50',
            payload: { grand_total: 100.0 },
          },
        ],
      });

      expect(response.success).toBe(true);
      expect(response.duplicateCount).toBe(1);
      expect(response.acknowledgedEventIds).toContain('ev-dup-1');
      // Verify no insert was performed on the sales table
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sales'),
        expect.anything(),
      );
    });
  });

  describe('ingestBranchBatch - Authority Matrix Enforcement', () => {
    it('applies branch-authoritative SALE mutations into HQ consolidated store', async () => {
      // 1. Idempotency check: not found
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        // 2. Insert into sales table
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 3. Insert into sync_inbox
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 4. Update checkpoint
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const response = await service.ingestBranchBatch({
        branchId: 'branch-1',
        batchTimestamp: new Date().toISOString(),
        events: [
          {
            eventId: 'ev-sale-1',
            sequenceNo: 51,
            entityType: 'SALE',
            entityId: 'sale-100',
            operation: 'INSERT',
            idempotencyKey: 'branch-1_SALE_sale-100_INSERT_51',
            payload: {
              terminal_id: 'term-1',
              shift_id: 'shift-1',
              receipt_number: 'REC-051',
              cashier_id: 'cashier-1',
              subtotal: 500,
              discount_total: 0,
              taxable_subtotal: 434.78,
              tax_exempt_subtotal: 0,
              tax_total: 65.22,
              grand_total: 500,
              total_paid: 500,
              change_given: 0,
              payment_status: 'PAID',
              fiscal_status: 'FISCALIZED',
            },
          },
        ],
      });

      expect(response.success).toBe(true);
      expect(response.acknowledgedEventIds).toContain('ev-sale-1');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sales'),
        expect.anything(),
      );
    });

    it('rejects branch mutation to HQ-authoritative entities and logs conflict', async () => {
      // 1. Idempotency check: not found
      mockClient.query
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        // 2. Log conflict in sync_conflict_logs
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 3. Insert into sync_inbox as processed
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        // 4. Update checkpoint
        .mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const response = await service.ingestBranchBatch({
        branchId: 'branch-1',
        batchTimestamp: new Date().toISOString(),
        events: [
          {
            eventId: 'ev-prod-1',
            sequenceNo: 52,
            entityType: 'PRODUCT', // HQ-authoritative!
            entityId: 'prod-100',
            operation: 'UPDATE',
            idempotencyKey: 'branch-1_PRODUCT_prod-100_UPDATE_52',
            payload: { name_en: 'Branch modified name' },
          },
        ],
      });

      expect(response.success).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_conflict_logs'),
        expect.arrayContaining([
          expect.anything(),
          'branch-1',
          'PRODUCT',
          'prod-100',
        ]),
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('AUTHORITY_VIOLATION'),
        expect.anything(),
      );
    });
  });
});
