import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import {
  SyncEntityType,
  SyncOperation,
  SyncOutboxEvent,
  SyncStreamStatus,
} from './domain/sync.types';

@Injectable()
export class SyncOutboxService {
  private readonly logger = new Logger(SyncOutboxService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Enqueues a domain mutation event into the append-only sync outbox table.
   * Runs within the caller's active database transaction to guarantee ACID event-sourcing consistency.
   */
  async queueEvent(
    client: PoolClient,
    branchId: string,
    entityType: SyncEntityType,
    entityId: string,
    operation: SyncOperation,
    payload: Record<string, any>,
  ): Promise<string> {
    const eventId = generateUuidV7();
    const idempotencyKey = `${branchId}_${entityType}_${entityId}_${operation}_${Date.now()}`;

    await client.query(
      `INSERT INTO sync_outbox (
        id, branch_id, entity_type, entity_id, operation, idempotency_key, payload, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')`,
      [
        eventId,
        branchId,
        entityType,
        entityId,
        operation,
        idempotencyKey,
        JSON.stringify(payload),
      ],
    );

    return eventId;
  }

  /**
   * Fetches an ordered batch chunk of pending outbox events using cursor-based pagination.
   */
  async fetchPendingBatch(
    branchId: string,
    limit = 100,
    afterSequence = 0,
  ): Promise<SyncOutboxEvent[]> {
    const res = await this.db.query<SyncOutboxEvent>(
      `SELECT * FROM sync_outbox
       WHERE branch_id = $1 
         AND status = 'PENDING' 
         AND sequence_no > $2
       ORDER BY sequence_no ASC
       LIMIT $3`,
      [branchId, afterSequence, limit],
    );

    return res.rows;
  }

  /**
   * Marks events as acknowledged after successful confirmation from HQ sync API.
   */
  async acknowledgeBatch(
    branchId: string,
    eventIds: string[],
    lastSequenceNo: number,
  ): Promise<void> {
    if (eventIds.length === 0) return;

    await this.db.withTransaction(async (client) => {
      // 1. Mark individual outbox records as ACKNOWLEDGED
      await client.query(
        `UPDATE sync_outbox
         SET status = 'ACKNOWLEDGED', acknowledged_at = clock_timestamp()
         WHERE branch_id = $1 AND id = ANY($2::uuid[])`,
        [branchId, eventIds],
      );

      // 2. Update the sync checkpoint high-water mark
      await client.query(
        `INSERT INTO sync_checkpoints (branch_id, stream_name, last_synced_sequence, last_synced_at)
         VALUES ($1, 'OUTBOX_TO_HQ', $2, clock_timestamp())
         ON CONFLICT (branch_id, stream_name) DO UPDATE SET
           last_synced_sequence = GREATEST(sync_checkpoints.last_synced_sequence, EXCLUDED.last_synced_sequence),
           last_synced_at = clock_timestamp()`,
        [branchId, lastSequenceNo],
      );
    });
  }

  /**
   * Records failure details and increments retry counter for an outbox event.
   */
  async recordFailure(eventId: string, errorMessage: string): Promise<void> {
    await this.db.query(
      `UPDATE sync_outbox
       SET status = 'FAILED',
           retry_count = retry_count + 1,
           last_error = $1
       WHERE id = $2`,
      [errorMessage, eventId],
    );
  }

  /**
   * Inspects the branch outbox stream status and freshness.
   */
  async getStreamStatus(branchId: string): Promise<SyncStreamStatus> {
    const counts = await this.db.query<{
      pending_count: string;
      in_flight_count: string;
    }>(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
         COUNT(*) FILTER (WHERE status = 'IN_FLIGHT') as in_flight_count
       FROM sync_outbox
       WHERE branch_id = $1`,
      [branchId],
    );

    const checkpoint = await this.db.query<{
      last_synced_sequence: string;
      last_synced_at: Date;
    }>(
      `SELECT last_synced_sequence, last_synced_at
       FROM sync_checkpoints
       WHERE branch_id = $1 AND stream_name = 'OUTBOX_TO_HQ'`,
      [branchId],
    );

    const pendingCount = parseInt(counts.rows[0]?.pending_count || '0', 10);
    const inFlightCount = parseInt(counts.rows[0]?.in_flight_count || '0', 10);
    const lastSeq = checkpoint.rowCount
      ? parseInt(checkpoint.rows[0].last_synced_sequence, 10)
      : 0;
    const lastSync = checkpoint.rowCount ? checkpoint.rows[0].last_synced_at : null;

    // Fresh if synced within the last 15 minutes
    const isFresh =
      lastSync !== null &&
      Date.now() - new Date(lastSync).getTime() < 15 * 60 * 1000;

    return {
      branchId,
      pendingOutboxCount: pendingCount,
      inFlightCount,
      lastAcknowledgedSequence: lastSeq,
      lastSyncTimestamp: lastSync,
      isFresh,
    };
  }
}
