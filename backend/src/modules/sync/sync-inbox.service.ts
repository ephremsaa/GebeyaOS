import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { generateUuidV7 } from '../../common/utils/uuidv7';
import {
  SyncBatchPayload,
  SyncBatchResponse,
  SyncEntityType,
} from './domain/sync.types';

@Injectable()
export class SyncInboxService {
  private readonly logger = new Logger(SyncInboxService.name);

  // Entities where the Branch has sole authority (HQ only ingests append-only records)
  private readonly branchAuthoritativeEntities = new Set<SyncEntityType>([
    'SALE',
    'STOCK_LEDGER',
    'SHIFT',
    'STOCK_ADJUSTMENT',
    'STOCK_TAKE',
  ]);

  // Entities where HQ has sole authority (HQ overrides branch)
  private readonly hqAuthoritativeEntities = new Set<SyncEntityType>([
    'PRODUCT',
    'CATEGORY',
    'USER',
    'ROLE',
  ]);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Ingests a batch of events pushed by a branch server.
   * Atomic transaction with idempotency deduplication and authority resolution.
   */
  async ingestBranchBatch(batch: SyncBatchPayload): Promise<SyncBatchResponse> {
    const acknowledgedEventIds: string[] = [];
    const failedEventIds: string[] = [];
    let duplicateCount = 0;
    let maxSequence = 0;

    await this.db.withTransaction(async (client) => {
      for (const event of batch.events) {
        if (event.sequenceNo > maxSequence) {
          maxSequence = event.sequenceNo;
        }

        // 1. Idempotency Check: Was this event already ingested?
        const existingInbox = await client.query(
          `SELECT id, status FROM sync_inbox WHERE idempotency_key = $1`,
          [event.idempotencyKey],
        );

        if (existingInbox.rowCount && existingInbox.rowCount > 0) {
          // Duplicate event: acknowledge safely without re-applying mutation
          duplicateCount++;
          acknowledgedEventIds.push(event.eventId);
          continue;
        }

        try {
          // 2. Conflict & Authority Evaluation
          if (this.hqAuthoritativeEntities.has(event.entityType)) {
            // Branch cannot mutate HQ authoritative entities (Catalog, Roles, Users)
            await client.query(
              `INSERT INTO sync_conflict_logs (
                id, branch_id, entity_type, entity_id, conflict_type,
                local_state, remote_state, resolution
              ) VALUES ($1, $2, $3, $4, 'AUTHORITY_VIOLATION', $5, $6, 'HQ_WINS')`,
              [
                generateUuidV7(),
                batch.branchId,
                event.entityType,
                event.entityId,
                JSON.stringify({ note: 'HQ is authoritative for this entity' }),
                JSON.stringify(event.payload),
              ],
            );
          } else if (this.branchAuthoritativeEntities.has(event.entityType)) {
            // Apply branch transactional mutation into HQ consolidated store
            await this.applyBranchAuthoritativeMutation(client, batch.branchId, event);
          }

          // 3. Record in sync_inbox
          await client.query(
            `INSERT INTO sync_inbox (
              id, source_branch_id, sequence_no, entity_type, entity_id,
              operation, idempotency_key, payload, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PROCESSED')`,
            [
              generateUuidV7(),
              batch.branchId,
              event.sequenceNo,
              event.entityType,
              event.entityId,
              event.operation,
              event.idempotencyKey,
              JSON.stringify(event.payload),
            ],
          );

          acknowledgedEventIds.push(event.eventId);
        } catch (err: any) {
          this.logger.error(
            `Failed to ingest sync event ${event.eventId} (${event.entityType}): ${err.message}`,
          );
          failedEventIds.push(event.eventId);

          await client.query(
            `INSERT INTO sync_inbox (
              id, source_branch_id, sequence_no, entity_type, entity_id,
              operation, idempotency_key, payload, status, error_message
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'FAILED', $8)`,
            [
              generateUuidV7(),
              batch.branchId,
              event.sequenceNo,
              event.entityType,
              event.entityId,
              event.operation,
              event.idempotencyKey,
              JSON.stringify(event.payload),
              err.message,
            ],
          );
        }
      }

      // 4. Update HQ checkpoint for this branch
      if (maxSequence > 0) {
        await client.query(
          `INSERT INTO sync_checkpoints (branch_id, stream_name, last_synced_sequence, last_synced_at)
           VALUES ($1, 'BRANCH_TO_HQ', $2, clock_timestamp())
           ON CONFLICT (branch_id, stream_name) DO UPDATE SET
             last_synced_sequence = GREATEST(sync_checkpoints.last_synced_sequence, EXCLUDED.last_synced_sequence),
             last_synced_at = clock_timestamp()`,
          [batch.branchId, maxSequence],
        );
      }
    });

    return {
      success: failedEventIds.length === 0,
      acknowledgedEventIds,
      failedEventIds,
      duplicateCount,
      lastProcessedSequence: maxSequence,
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Dispatches ingestion of branch-authoritative records into HQ database.
   */
  private async applyBranchAuthoritativeMutation(
    client: any,
    branchId: string,
    event: {
      entityType: SyncEntityType;
      entityId: string;
      operation: string;
      payload: Record<string, any>;
    },
  ) {
    const p = event.payload;

    if (event.entityType === 'SALE') {
      await client.query(
        `INSERT INTO sales (
          id, branch_id, terminal_id, shift_id, receipt_number, cashier_id,
          subtotal, discount_total, taxable_subtotal, tax_exempt_subtotal,
          tax_total, grand_total, total_paid, change_given,
          payment_status, fiscal_status, fiscal_receipt_no, client_timestamp, server_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (id) DO NOTHING`,
        [
          event.entityId,
          branchId,
          p.terminal_id,
          p.shift_id,
          p.receipt_number,
          p.cashier_id,
          p.subtotal,
          p.discount_total,
          p.taxable_subtotal,
          p.tax_exempt_subtotal,
          p.tax_total,
          p.grand_total,
          p.total_paid,
          p.change_given,
          p.payment_status,
          p.fiscal_status,
          p.fiscal_receipt_no || null,
          p.client_timestamp || new Date(),
          p.server_timestamp || new Date(),
        ],
      );
    } else if (event.entityType === 'STOCK_LEDGER') {
      await client.query(
        `INSERT INTO stock_ledger (
          id, branch_id, product_id, batch_id, movement_type,
          quantity_change, unit_cost, balance_after, reference_type, reference_id, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO NOTHING`,
        [
          event.entityId,
          branchId,
          p.product_id,
          p.batch_id || null,
          p.movement_type,
          p.quantity_change,
          p.unit_cost,
          p.balance_after,
          p.reference_type,
          p.reference_id,
          p.notes || null,
          p.created_by || null,
        ],
      );
    }
  }
}
