import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  SyncAggregateType,
  SyncEventType,
  SyncEvent,
  PacketBuilder,
} from '@gebeyaos/sync-protocol';

export interface OutboxEntry {
  id: string;
  sequenceNo: number;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  idempotencyKey: string;
  status: 'PENDING' | 'IN_FLIGHT' | 'ACKNOWLEDGED' | 'FAILED';
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  payload: Record<string, any>;
}

export interface InboxEntry {
  id: string;
  sourceBranchId: string;
  sequenceNo: number;
  entityType: string;
  entityId: string;
  operation: string;
  idempotencyKey: string;
  status: string;
  processedAt: string;
  errorMessage: string | null;
  payload: Record<string, any>;
}

export interface ConflictLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  conflictType: string;
  localState: Record<string, any> | null;
  remoteState: Record<string, any> | null;
  resolution: 'HQ_WINS' | 'BRANCH_WINS' | 'MANUAL_INTERVENTION';
  resolvedAt: string;
}

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
         COUNT(*) FILTER (WHERE status = 'FAILED' OR retry_count >= 5) as failed_count,
         MAX(acknowledged_at) as last_ack_at
       FROM sync_outbox`,
    );

    const row = res.rows[0] || {
      pending_count: 0,
      in_flight_count: 0,
      ack_count: 0,
      failed_count: 0,
      last_ack_at: null,
    };

    return {
      pending: parseInt(row.pending_count || 0, 10),
      inFlight: parseInt(row.in_flight_count || 0, 10),
      acknowledged: parseInt(row.ack_count || 0, 10),
      failed: parseInt(row.failed_count || 0, 10),
      lastAcknowledgedAt: row.last_ack_at ? (row.last_ack_at instanceof Date ? row.last_ack_at.toISOString() : String(row.last_ack_at)) : null,
    };
  }

  /**
   * Returns recent outbox events for manager inspection.
   */
  async getOutboxEvents(limit = 100): Promise<OutboxEntry[]> {
    try {
      const res = await this.db.query<any>(
        `SELECT id, sequence_no, aggregate_type, aggregate_id, event_type, idempotency_key,
                status, retry_count, last_error, created_at, acknowledged_at, payload
         FROM sync_outbox
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        sequenceNo: parseInt(r.sequence_no || '0', 10),
        aggregateType: r.aggregate_type,
        aggregateId: r.aggregate_id,
        eventType: r.event_type || 'CREATED',
        idempotencyKey: r.idempotency_key,
        status: r.status,
        retryCount: parseInt(r.retry_count || '0', 10),
        lastError: r.last_error || null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        acknowledgedAt: r.acknowledged_at ? (r.acknowledged_at instanceof Date ? r.acknowledged_at.toISOString() : String(r.acknowledged_at)) : null,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {},
      }));
    } catch {
      return [];
    }
  }

  /**
   * Returns inbox events applied locally from HQ.
   */
  async getInboxEvents(limit = 100): Promise<InboxEntry[]> {
    try {
      const res = await this.db.query<any>(
        `SELECT id, source_branch_id, sequence_no, entity_type, entity_id, operation,
                idempotency_key, status, processed_at, error_message, payload
         FROM sync_inbox
         ORDER BY id DESC
         LIMIT $1`,
        [limit],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        sourceBranchId: r.source_branch_id,
        sequenceNo: parseInt(r.sequence_no || '0', 10),
        entityType: r.entity_type,
        entityId: r.entity_id,
        operation: r.operation,
        idempotencyKey: r.idempotency_key,
        status: r.status,
        processedAt: r.processed_at instanceof Date ? r.processed_at.toISOString() : String(r.processed_at),
        errorMessage: r.error_message || null,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {},
      }));
    } catch {
      return [];
    }
  }

  /**
   * Returns conflict resolution logs.
   */
  async getConflictLogs(limit = 100): Promise<ConflictLogEntry[]> {
    try {
      const res = await this.db.query<any>(
        `SELECT id, entity_type, entity_id, conflict_type, local_state, remote_state, resolution, resolved_at
         FROM sync_conflict_logs
         ORDER BY resolved_at DESC
         LIMIT $1`,
        [limit],
      );

      return res.rows.map((r: any) => ({
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        conflictType: r.conflict_type,
        localState: typeof r.local_state === 'string' ? JSON.parse(r.local_state) : r.local_state || null,
        remoteState: typeof r.remote_state === 'string' ? JSON.parse(r.remote_state) : r.remote_state || null,
        resolution: r.resolution,
        resolvedAt: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : String(r.resolved_at),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Resets an individual failed event back to PENDING.
   */
  async retryEvent(id: string): Promise<boolean> {
    const res = await this.db.query<any>(
      `UPDATE sync_outbox
       SET status = 'PENDING', retry_count = 0, last_error = NULL
       WHERE id = $1`,
      [id],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Resets all failed outbox events back to PENDING.
   */
  async retryAllFailed(): Promise<number> {
    const res = await this.db.query<any>(
      `UPDATE sync_outbox
       SET status = 'PENDING', retry_count = 0, last_error = NULL
       WHERE status = 'FAILED' OR retry_count > 0`,
    );
    return res.rowCount || 0;
  }
}
