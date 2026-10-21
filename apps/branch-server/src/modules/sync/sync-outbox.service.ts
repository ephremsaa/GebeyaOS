import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  SyncAggregateType,
  SyncEventType,
  SyncEvent,
  PacketBuilder,
} from '@gebeyaos/sync-protocol';

@Injectable()
export class SyncOutboxService {
  private readonly logger = new Logger(SyncOutboxService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Enqueues an event into sync_outbox.
   * Can be invoked within an ongoing domain transaction for transactional outbox semantics.
   */
  async enqueueEvent(
    branchId: string,
    aggregateType: SyncAggregateType,
    aggregateId: string,
    eventType: SyncEventType,
    payload: Record<string, any>,
    client?: PoolClient,
  ): Promise<string> {
    const idempotencyKey = PacketBuilder.buildIdempotencyKey(
      branchId,
      aggregateType,
      aggregateId,
      eventType,
    );

    const queryFn = client
      ? (text: string, params: any[]) => client.query(text, params)
      : (text: string, params: any[]) => this.db.query(text, params);

    const res = await queryFn(
      `INSERT INTO sync_outbox (
         aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
       ON CONFLICT (idempotency_key) DO UPDATE
       SET payload = EXCLUDED.payload, status = 'PENDING', retry_count = 0
       RETURNING id`,
      [
        aggregateType,
        aggregateId,
        eventType,
        JSON.stringify(payload),
        idempotencyKey,
      ],
    );

    return res.rows[0].id;
  }

  /**
   * Fetches pending events in FIFO order and marks them as IN_FLIGHT.
   */
  async getPendingBatch(
    branchId: string,
    limit = 100,
  ): Promise<SyncEvent[]> {
    return this.db.withTransaction(async (client) => {
      const res = await client.query<any>(
        `SELECT id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, created_at
         FROM sync_outbox
         WHERE status = 'PENDING'
         ORDER BY created_at ASC, id ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [limit],
      );

      if (res.rows.length === 0) {
        return [];
      }

      const ids = res.rows.map((r: any) => r.id);
      await client.query(
        `UPDATE sync_outbox SET status = 'IN_FLIGHT' WHERE id = ANY($1)`,
        [ids],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        sourceBranchId: branchId,
        aggregateType: r.aggregate_type,
        aggregateId: r.aggregate_id,
        eventType: r.event_type,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
        idempotencyKey: r.idempotency_key,
        timestamp: r.created_at.toISOString(),
      }));
    });
  }

  /**
   * Acknowledges successfully received events from HQ.
   */
  async acknowledgeBatch(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;

    await this.db.query(
      `UPDATE sync_outbox
       SET status = 'ACKNOWLEDGED', acknowledged_at = clock_timestamp()
       WHERE id = ANY($1)`,
      [eventIds],
    );
  }

  /**
   * Resets failed in-flight events back to PENDING with backoff increments.
   */
  async recordBatchFailures(eventIds: string[], errorMessage: string): Promise<void> {
    if (eventIds.length === 0) return;

    await this.db.query(
      `UPDATE sync_outbox
       SET status = 'PENDING',
           retry_count = retry_count + 1,
           last_error = $1
       WHERE id = ANY($2)`,
      [errorMessage, eventIds],
    );
  }

  /**
   * Returns outbox health summary.
   */
  async getOutboxStatus() {
    const res = await this.db.query<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
         COUNT(*) FILTER (WHERE status = 'IN_FLIGHT') as in_flight_count,
         COUNT(*) FILTER (WHERE status = 'ACKNOWLEDGED') as ack_count,
         COUNT(*) FILTER (WHERE status = 'FAILED') as failed_count,
         MAX(acknowledged_at) as last_ack_at
       FROM sync_outbox`,
    );

    const row = res.rows[0];
    return {
      pending: parseInt(row.pending_count, 10),
      inFlight: parseInt(row.in_flight_count, 10),
      acknowledged: parseInt(row.ack_count, 10),
      failed: parseInt(row.failed_count, 10),
      lastAcknowledgedAt: row.last_ack_at ? row.last_ack_at.toISOString() : null,
    };
  }
}
