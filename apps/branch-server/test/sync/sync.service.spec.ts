import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncOutboxService } from '../../src/modules/sync/sync-outbox.service';
import { SyncClientService } from '../../src/modules/sync/sync-client.service';
import { DatabaseService } from '../../src/common/database/database.service';
import {
  SyncBatchPushRequest,
  SyncBatchPushResponse,
  SyncPullResponse,
  ConflictResolver,
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

    it('allows retrying individual failed events and resetting retry counts', async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });

      const ok = await outboxService.retryEvent('ev-failed-01');
      expect(ok).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'PENDING', retry_count = 0, last_error = NULL"),
        ['ev-failed-01'],
      );
    });
  });

  describe('SyncClientService', () => {
    it('pushes pending batch to HQ via transport and marks ACK', async () => {
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

    it('detects clock skew when local clock drifts from HQ server sequence timestamp', () => {
      // 10 minutes drift = 600 seconds (> 300s threshold)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const skew = clientService.detectClockSkew(tenMinutesAgo);

      expect(skew.isSkewed).toBe(true);
      expect(skew.skewSeconds).toBeGreaterThanOrEqual(599);

      // Normal drift within 2 seconds
      const nowServer = new Date(Date.now() - 1000).toISOString();
      const normalSkew = clientService.detectClockSkew(nowServer);
      expect(normalSkew.isSkewed).toBe(false);
    });

    it('triggers health alert after 5 consecutive failed attempts', async () => {
      const failingTransport = vi
        .fn()
        .mockRejectedValue(new Error('Connection refused'));

      for (let i = 0; i < 5; i++) {
        vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce([
          {
            id: `ev-0${i}`,
            sourceBranchId: 'b-01',
            aggregateType: 'SALE',
            aggregateId: `sale-0${i}`,
            eventType: 'CREATED',
            payload: {},
            idempotencyKey: `KEY-${i}`,
            timestamp: new Date().toISOString(),
          },
        ]);

        try {
          await clientService.pushPendingEvents('b-01', 100, failingTransport);
        } catch {
          // Expected failure
        }
      }

      const status = clientService.getSyncStatus();
      expect(status.consecutiveFailures).toBe(5);
      expect(status.healthAlert).toContain('5 consecutive network failures');
      expect(status.healthAlert).toContain('Sales are safely saved locally');
    });
  });

  describe('Sync Protocol & Logic Scenarios', () => {
    it('handles duplicate delivery safely via idempotency keys', async () => {
      // Simulating push of an event that HQ already acknowledged
      const event = {
        id: 'ev-dup-01',
        sourceBranchId: 'b-01',
        aggregateType: 'SALE' as const,
        aggregateId: 'tx-100',
        eventType: 'CREATED' as const,
        payload: { grandTotal: 450 },
        idempotencyKey: 'B-01:SALE:TX-100:CREATED',
        timestamp: new Date().toISOString(),
      };

      vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce([event]);
      const mockAck = vi.spyOn(outboxService, 'acknowledgeBatch').mockResolvedValueOnce();

      // HQ returns ACK for the duplicate without errors
      const mockTransport = vi.fn().mockResolvedValueOnce({
        success: true,
        sourceBranchId: 'b-01',
        batchId: 'batch-dup',
        acknowledgedEventIds: ['ev-dup-01'],
        failedEventIds: [],
        conflicts: [],
        serverTimestamp: new Date().toISOString(),
      });

      const res = await clientService.pushPendingEvents('b-01', 100, mockTransport);
      expect(res.ackCount).toBe(1);
      expect(mockAck).toHaveBeenCalledWith(['ev-dup-01']);
    });

    it('enforces Authority Matrix on conflicts (HQ owns Catalog/Prices, Branch owns Sales/Stock)', () => {
      // 1. Branch attempts to push a master product change -> Rejection: HQ_WINS
      const productEvent = {
        id: 'ev-prod',
        sourceBranchId: 'b-01',
        aggregateType: 'PRODUCT' as const,
        aggregateId: 'p-01',
        eventType: 'UPDATED' as const,
        payload: { basePrice: 100 },
        idempotencyKey: 'B-01:PRODUCT:P-01:UPDATED',
        timestamp: new Date().toISOString(),
      };
      const productEval = ConflictResolver.evaluateBranchEvent(productEvent);
      expect(productEval.accepted).toBe(false);
      expect(productEval.policy).toBe('APPLIED_HQ');
      expect(productEval.reason).toContain('HQ is solely authoritative for master product catalog');

      // 2. Branch pushes a POS sale transaction -> Acceptance: APPLIED_BRANCH
      const saleEvent = {
        id: 'ev-sale',
        sourceBranchId: 'b-01',
        aggregateType: 'SALE' as const,
        aggregateId: 's-01',
        eventType: 'CREATED' as const,
        payload: { grandTotal: 250 },
        idempotencyKey: 'B-01:SALE:S-01:CREATED',
        timestamp: new Date().toISOString(),
      };
      const saleEval = ConflictResolver.evaluateBranchEvent(saleEvent);
      expect(saleEval.accepted).toBe(true);
      expect(saleEval.policy).toBe('APPLIED_BRANCH');
      expect(saleEval.reason).toContain('Branch is solely authoritative for POS sales');

      // 3. Branch pushes stock ledger movement -> Acceptance: APPLIED_BRANCH
      const stockEvent = {
        id: 'ev-stock',
        sourceBranchId: 'b-01',
        aggregateType: 'STOCK_LEDGER' as const,
        aggregateId: 'sl-01',
        eventType: 'CREATED' as const,
        payload: { quantityChange: -5 },
        idempotencyKey: 'B-01:STOCK_LEDGER:SL-01:CREATED',
        timestamp: new Date().toISOString(),
      };
      const stockEval = ConflictResolver.evaluateBranchEvent(stockEvent);
      expect(stockEval.accepted).toBe(true);
      expect(stockEval.policy).toBe('APPLIED_BRANCH');
      expect(stockEval.reason).toContain('Branch owns local inventory stock movements');
    });

    it('supports partial batch failure without losing acknowledged items', async () => {
      vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce([
        {
          id: 'ev-ok-01',
          sourceBranchId: 'b-01',
          aggregateType: 'SALE',
          aggregateId: 's-01',
          eventType: 'CREATED',
          payload: { grandTotal: 100 },
          idempotencyKey: 'KEY-01',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'ev-fail-02',
          sourceBranchId: 'b-01',
          aggregateType: 'SALE',
          aggregateId: 's-02',
          eventType: 'CREATED',
          payload: { grandTotal: 200 },
          idempotencyKey: 'KEY-02',
          timestamp: new Date().toISOString(),
        },
      ]);

      const mockAck = vi.spyOn(outboxService, 'acknowledgeBatch').mockResolvedValueOnce();
      const mockFail = vi.spyOn(outboxService, 'recordBatchFailures').mockResolvedValueOnce();

      // HQ acknowledges event 1, but rejects event 2
      const mockTransport = vi.fn().mockResolvedValueOnce({
        success: true,
        sourceBranchId: 'b-01',
        batchId: 'batch-partial',
        acknowledgedEventIds: ['ev-ok-01'],
        failedEventIds: ['ev-fail-02'],
        conflicts: [],
        serverTimestamp: new Date().toISOString(),
      });

      const res = await clientService.pushPendingEvents('b-01', 100, mockTransport);
      expect(res.ackCount).toBe(1);
      expect(mockAck).toHaveBeenCalledWith(['ev-ok-01']);
      expect(mockFail).toHaveBeenCalledWith(['ev-fail-02'], 'Rejected by HQ');
    });

    it('catches up after being offline for days with multi-batch queuing', async () => {
      // 50 pending events queued in outbox while disconnected
      const queuedEvents = Array.from({ length: 50 }).map((_, i) => ({
        id: `ev-queued-${i}`,
        sourceBranchId: 'b-01',
        aggregateType: 'SALE' as const,
        aggregateId: `tx-${i}`,
        eventType: 'CREATED' as const,
        payload: { grandTotal: 100 + i },
        idempotencyKey: `B-01:SALE:TX-${i}:CREATED`,
        timestamp: new Date(Date.now() - 3 * 86400000 + i * 1000).toISOString(),
      }));

      vi.spyOn(outboxService, 'getPendingBatch').mockResolvedValueOnce(queuedEvents);
      const mockAck = vi.spyOn(outboxService, 'acknowledgeBatch').mockResolvedValueOnce();

      const mockTransport = vi.fn().mockResolvedValueOnce({
        success: true,
        sourceBranchId: 'b-01',
        batchId: 'batch-catchup-01',
        acknowledgedEventIds: queuedEvents.map((e) => e.id),
        failedEventIds: [],
        conflicts: [],
        serverTimestamp: new Date().toISOString(),
      });

      const result = await clientService.pushPendingEvents('b-01', 100, mockTransport);
      expect(result.pushedCount).toBe(50);
      expect(result.ackCount).toBe(50);
      expect(mockAck).toHaveBeenCalledWith(queuedEvents.map((e) => e.id));
    });
  });
});
