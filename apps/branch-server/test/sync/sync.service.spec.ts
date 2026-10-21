import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOutboxService } from '../../src/modules/sync/sync-outbox.service';
import { SyncClientService } from '../../src/modules/sync/sync-client.service';
import { DatabaseService } from '../../src/common/database/database.service';
import {
  SyncBatchPushRequest,
  SyncBatchPushResponse,
  SyncPullResponse,
} from '@gebeyaos/sync-protocol';

describe('Branch Server Sync Engine', () => {
  let outboxService: SyncOutboxService;
  let clientService: SyncClientService;
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

    outboxService = new SyncOutboxService(mockDb as unknown as DatabaseService);
    clientService = new SyncClientService(
      mockDb as unknown as DatabaseService,
      outboxService,
    );
  });

  describe('SyncOutboxService', () => {
    it('enqueues events with deterministic idempotency key and PENDING status', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'outbox-uuid-01' }],
      });

      const id = await outboxService.enqueueEvent(
        'b-01',
        'SALE',
        'sale-01',
        'CREATED',
        { grandTotal: 250 },
      );

      expect(id).toBe('outbox-uuid-01');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sync_outbox'),
        [
          'SALE',
          'sale-01',
          'CREATED',
          JSON.stringify({ grandTotal: 250 }),
          'B-01:SALE:SALE-01:CREATED',
        ],
      );
    });

    it('retrieves pending batch and transitions events to IN_FLIGHT', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ev-01',
            aggregate_type: 'SALE',
            aggregate_id: 'sale-01',
            event_type: 'CREATED',
            payload: { grandTotal: 500 },
            idempotency_key: 'KEY-01',
            created_at: new Date('2026-10-21T10:00:00Z'),
          },
        ],
      });

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // update to IN_FLIGHT

      const batch = await outboxService.getPendingBatch('b-01', 50);

      expect(batch).toHaveLength(1);
      expect(batch[0].id).toBe('ev-01');
      expect(batch[0].aggregateType).toBe('SALE');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'IN_FLIGHT'"),
        [['ev-01']],
      );
    });

    it('acknowledges batch of events from HQ', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await outboxService.acknowledgeBatch(['ev-01', 'ev-02']);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'ACKNOWLEDGED'"),
        [['ev-01', 'ev-02']],
      );
    });

    it('records batch failures and increments retry count', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await outboxService.recordBatchFailures(['ev-01'], 'Connection timeout');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('retry_count = retry_count + 1'),
        ['Connection timeout', ['ev-01']],
      );
    });
  });

  describe('SyncClientService', () => {
    it('pushes pending batch to HQ via transport and marks ACK', async () => {
      // Mock outbox.getPendingBatch
      vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce([
        {
          id: 'ev-01',
          sourceBranchId: 'b-01',
          aggregateType: 'SALE',
          aggregateId: 'sale-01',
          eventType: 'CREATED',
          payload: { grandTotal: 300 },
          idempotencyKey: 'KEY-01',
          timestamp: new Date().toISOString(),
        },
      ]);

      const mockAck = vi
        .spyOn(outboxService, 'acknowledgeBatch')
        .mockResolvedValueOnce();

      const mockTransport = vi.fn().mockResolvedValueOnce({
        success: true,
        sourceBranchId: 'b-01',
        batchId: 'batch-01',
        acknowledgedEventIds: ['ev-01'],
        failedEventIds: [],
        conflicts: [],
        serverTimestamp: new Date().toISOString(),
      } as SyncBatchPushResponse);

      const result = await clientService.pushPendingEvents(
        'b-01',
        100,
        mockTransport,
      );

      expect(result.pushedCount).toBe(1);
      expect(result.ackCount).toBe(1);
      expect(mockAck).toHaveBeenCalledWith(['ev-01']);
    });

    it('applies exponential backoff on consecutive network failures', async () => {
      vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce([
        {
          id: 'ev-01',
          sourceBranchId: 'b-01',
          aggregateType: 'SALE',
          aggregateId: 'sale-01',
          eventType: 'CREATED',
          payload: { grandTotal: 300 },
          idempotencyKey: 'KEY-01',
          timestamp: new Date().toISOString(),
        },
      ]);

      const failingTransport = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network offline'));

      await expect(
        clientService.pushPendingEvents('b-01', 100, failingTransport),
      ).rejects.toThrow('Network offline');

      const status = clientService.getSyncStatus();
      expect(status.isOnline).toBe(false);
      expect(status.consecutiveFailures).toBe(1);
      expect(status.backoffDelayMs).toBe(2000); // 1000 * 2^1 = 2000ms
    });

    it('pulls catalog deltas and applies product updates locally', async () => {
      const mockPullTransport = vi.fn().mockResolvedValueOnce({
        branchId: 'b-01',
        deltas: [
          {
            aggregateType: 'PRODUCT',
            aggregateId: 'p-new',
            eventType: 'UPDATED',
            data: {
              id: 'p-new',
              sku: 'SKU-NEW',
              nameEn: 'Imported Biscuit',
              categoryId: 'cat-01',
              uomCode: 'PCS',
              basePrice: 50,
              costPrice: 35,
              isVatApplicable: true,
              vatRate: 0.15,
            },
            updatedAt: new Date().toISOString(),
          },
        ],
        syncedUntil: new Date().toISOString(),
        hasMore: false,
      } as SyncPullResponse);

      mockClient.query.mockResolvedValueOnce({ rows: [] }); // insert/update product

      const result = await clientService.pullCatalogDeltas(
        'b-01',
        mockPullTransport,
      );

      expect(result.appliedCount).toBe(1);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO products'),
        expect.arrayContaining(['p-new', 'SKU-NEW', 'Imported Biscuit']),
      );
    });
  });
});
