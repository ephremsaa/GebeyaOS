import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncCoordinatorService } from '../../src/modules/sync/sync-coordinator.service';
import { SyncOutboxService } from '../../src/modules/sync/sync-outbox.service';
import { SyncInboxService } from '../../src/modules/sync/sync-inbox.service';

describe('SyncCoordinatorService', () => {
  let coordinator: SyncCoordinatorService;
  let mockOutbox: Partial<SyncOutboxService>;
  let mockInbox: Partial<SyncInboxService>;

  beforeEach(() => {
    mockOutbox = {
      getStreamStatus: vi.fn(),
      fetchPendingBatch: vi.fn(),
      acknowledgeBatch: vi.fn(),
    };
    mockInbox = {
      ingestBranchBatch: vi.fn(),
    };

    coordinator = new SyncCoordinatorService(
      mockOutbox as SyncOutboxService,
      mockInbox as SyncInboxService,
    );
  });

  describe('calculateBackoffDelayMs', () => {
    it('increases delay exponentially bounded by maxMs', () => {
      const delay0 = coordinator.calculateBackoffDelayMs(0, 1000, 60000);
      const delay1 = coordinator.calculateBackoffDelayMs(1, 1000, 60000);
      const delay3 = coordinator.calculateBackoffDelayMs(3, 1000, 60000);
      const delay10 = coordinator.calculateBackoffDelayMs(10, 1000, 60000);

      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay3).toBeGreaterThanOrEqual(8000);
      expect(delay10).toBeLessThanOrEqual(60000);
    });
  });

  describe('triggerBranchSync - Offline-for-Days Multi-Batch Drainage', () => {
    it('drains multi-batch backlog in sequential cursor chunks without data loss', async () => {
      // Stream status initially: last ack sequence = 0
      (mockOutbox.getStreamStatus as any)
        .mockResolvedValueOnce({
          lastAcknowledgedSequence: 0,
          pendingOutboxCount: 400,
        })
        .mockResolvedValueOnce({
          pendingOutboxCount: 0,
        });

      // Batch 1 (200 events: seq 1 to 200)
      const batch1 = Array.from({ length: 200 }, (_, i) => ({
        id: `ev-${i + 1}`,
        sequence_no: i + 1,
        entity_type: 'SALE',
        entity_id: `sale-${i + 1}`,
        operation: 'INSERT',
        idempotency_key: `key-${i + 1}`,
        payload: {},
      }));

      // Batch 2 (200 events: seq 201 to 400)
      const batch2 = Array.from({ length: 200 }, (_, i) => ({
        id: `ev-${i + 201}`,
        sequence_no: i + 201,
        entity_type: 'SALE',
        entity_id: `sale-${i + 201}`,
        operation: 'INSERT',
        idempotency_key: `key-${i + 201}`,
        payload: {},
      }));

      (mockOutbox.fetchPendingBatch as any)
        .mockResolvedValueOnce(batch1) // First chunk
        .mockResolvedValueOnce(batch2) // Second chunk
        .mockResolvedValueOnce([]); // No more events

      (mockInbox.ingestBranchBatch as any)
        .mockResolvedValueOnce({
          success: true,
          acknowledgedEventIds: batch1.map((e) => e.id),
          failedEventIds: [],
          duplicateCount: 0,
          lastProcessedSequence: 200,
        })
        .mockResolvedValueOnce({
          success: true,
          acknowledgedEventIds: batch2.map((e) => e.id),
          failedEventIds: [],
          duplicateCount: 0,
          lastProcessedSequence: 400,
        });

      const result = await coordinator.triggerBranchSync('branch-1', 200);

      expect(result.eventsSynced).toBe(400);
      expect(result.batchesProcessed).toBe(2);
      expect(result.remainingPending).toBe(0);

      expect(mockOutbox.acknowledgeBatch).toHaveBeenCalledTimes(2);
      expect(mockOutbox.acknowledgeBatch).toHaveBeenNthCalledWith(
        1,
        'branch-1',
        expect.any(Array),
        200,
      );
      expect(mockOutbox.acknowledgeBatch).toHaveBeenNthCalledWith(
        2,
        'branch-1',
        expect.any(Array),
        400,
      );
    });
  });
});
