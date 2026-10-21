import {
  SyncAggregateType,
  SyncEventType,
  SyncEvent,
  SyncBatchPushRequest,
} from './sync.types';
import { generateUuidV7 } from '@gebeyaos/shared-types';

export class PacketBuilder {
  /**
   * Generates a deterministic idempotency key for an event.
   * Format: {BRANCH}-{AGGREGATE_TYPE}-{AGGREGATE_ID}-{EVENT_TYPE}
   */
  public static buildIdempotencyKey(
    branchId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
    eventType: SyncEventType,
  ): string {
    return `${branchId}:${aggregateType}:${aggregateId}:${eventType}`.toUpperCase();
  }

  /**
   * Constructs a typed SyncEvent with monotonic UUIDv7 and idempotency key.
   */
  public static buildSyncEvent(
    sourceBranchId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
    eventType: SyncEventType,
    payload: Record<string, any>,
    customId?: string,
  ): SyncEvent {
    const id = customId || generateUuidV7();
    const timestamp = new Date().toISOString();
    const idempotencyKey = this.buildIdempotencyKey(
      sourceBranchId,
      aggregateType,
      aggregateId,
      eventType,
    );

    return {
      id,
      sourceBranchId,
      aggregateType,
      aggregateId,
      eventType,
      payload,
      idempotencyKey,
      timestamp,
    };
  }

  /**
   * Packages a slice of events into a batch push request.
   */
  public static buildPushBatch(
    sourceBranchId: string,
    events: SyncEvent[],
    cursor?: string | null,
  ): SyncBatchPushRequest {
    const batchId = generateUuidV7();

    return {
      sourceBranchId,
      batchId,
      cursor: cursor || null,
      events,
    };
  }
}
