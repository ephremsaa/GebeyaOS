import { Injectable, Logger } from '@nestjs/common';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncInboxService } from './sync-inbox.service';
import { SyncBatchPayload, SyncBatchResponse } from './domain/sync.types';

@Injectable()
export class SyncCoordinatorService {
  private readonly logger = new Logger(SyncCoordinatorService.name);

  constructor(
    private readonly outboxService: SyncOutboxService,
    private readonly inboxService: SyncInboxService,
  ) {}

  /**
   * Calculates exponential backoff with jitter for network retries.
   */
  public calculateBackoffDelayMs(attempt: number, baseMs = 1000, maxMs = 60000): number {
    const exponent = Math.min(attempt, 6);
    const delay = baseMs * Math.pow(2, exponent);
    // Add up to 20% random jitter to avoid thundering herd across branches
    const jitter = delay * 0.2 * Math.random();
    return Math.min(maxMs, Math.floor(delay + jitter));
  }

  /**
   * Executes a full synchronization drain cycle for a branch.
   * Pulls chunked batches of pending outbox events and pushes them to Central HQ.
   */
  async triggerBranchSync(
    branchId: string,
    batchSize = 200,
    remotePushHandler?: (payload: SyncBatchPayload) => Promise<SyncBatchResponse>,
  ): Promise<{
    eventsSynced: number;
    batchesProcessed: number;
    remainingPending: number;
  }> {
    let eventsSynced = 0;
    let batchesProcessed = 0;
    let hasMore = true;

    const status = await this.outboxService.getStreamStatus(branchId);
    let afterSequence = status.lastAcknowledgedSequence;

    while (hasMore) {
      const batch = await this.outboxService.fetchPendingBatch(
        branchId,
        batchSize,
        afterSequence,
      );

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const payload: SyncBatchPayload = {
        branchId,
        batchTimestamp: new Date().toISOString(),
        events: batch.map((e) => ({
          eventId: e.id,
          sequenceNo: e.sequence_no,
          entityType: e.entity_type,
          entityId: e.entity_id,
          operation: e.operation,
          idempotencyKey: e.idempotency_key,
          payload: e.payload,
        })),
      };

      try {
        // Send to remote HQ (or local inbox if running in single-host test mode)
        const response: SyncBatchResponse = remotePushHandler
          ? await remotePushHandler(payload)
          : await this.inboxService.ingestBranchBatch(payload);

        if (response.acknowledgedEventIds.length > 0) {
          const maxAckSeq = Math.max(
            ...batch
              .filter((e) => response.acknowledgedEventIds.includes(e.id))
              .map((e) => e.sequence_no),
            afterSequence,
          );

          await this.outboxService.acknowledgeBatch(
            branchId,
            response.acknowledgedEventIds,
            maxAckSeq,
          );

          afterSequence = maxAckSeq;
          eventsSynced += response.acknowledgedEventIds.length;
          batchesProcessed++;
        }

        // If batch had failures or is smaller than batchSize, stop this cycle
        if (response.failedEventIds.length > 0 || batch.length < batchSize) {
          hasMore = false;
        }
      } catch (err: any) {
        this.logger.warn(`Sync push failed for branch ${branchId}: ${err.message}. Will retry with backoff.`);
        hasMore = false;
        break;
      }
    }

    const finalStatus = await this.outboxService.getStreamStatus(branchId);

    return {
      eventsSynced,
      batchesProcessed,
      remainingPending: finalStatus.pendingOutboxCount,
    };
  }
}
