import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  SyncBatchPushRequest,
  SyncBatchPushResponse,
  SyncPullResponse,
  CatalogDeltaItem,
  ConflictRecord,
  ConflictResolver,
} from '@gebeyaos/sync-protocol';

@Injectable()
export class HqSyncService {
  private readonly logger = new Logger(HqSyncService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Ingests a push batch from a branch into sync_inbox with idempotency and Authority Matrix evaluation.
   */
  async processBranchPush(req: SyncBatchPushRequest): Promise<SyncBatchPushResponse> {
    const acknowledgedEventIds: string[] = [];
    const failedEventIds: string[] = [];
    const conflicts: ConflictRecord[] = [];

    await this.db.withTransaction(async (client) => {
      for (const event of req.events) {
        // Evaluate event against Authority Matrix
        const evalResult = ConflictResolver.evaluateBranchEvent(event);

        if (!evalResult.accepted) {
          const conflict = ConflictResolver.createConflictRecord(event, evalResult);
          conflicts.push(conflict);
          failedEventIds.push(event.id);
          continue;
        }

        // Idempotently ingest event into sync_inbox
        await client.query(
          `INSERT INTO sync_inbox (
             source_branch_id, event_id, idempotency_key,
             aggregate_type, event_type, payload, status, conflict_resolution
           ) VALUES ($1, $2, $3, $4, $5, $6, 'APPLIED', $7)
           ON CONFLICT (idempotency_key) DO UPDATE
           SET processed_at = clock_timestamp()`,
          [
            req.sourceBranchId,
            event.id,
            event.idempotencyKey,
            event.aggregateType,
            event.eventType,
            JSON.stringify(event.payload),
            evalResult.policy,
          ],
        );

        acknowledgedEventIds.push(event.id);
      }
    });

    return {
      success: true,
      sourceBranchId: req.sourceBranchId,
      batchId: req.batchId,
      acknowledgedEventIds,
      failedEventIds,
      conflicts,
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Provides catalog deltas for branches to pull.
   */
  async getCatalogDeltas(
    branchId: string,
    lastSyncedAt?: string | null,
    limit = 100,
  ): Promise<SyncPullResponse> {
    const sinceDate = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0);
    const deltas: CatalogDeltaItem[] = [];

    // 1. Categories
    const catRes = await this.db.query<any>(
      `SELECT id, code, name_en, name_am, is_active, updated_at
       FROM categories
       WHERE updated_at > $1
       ORDER BY updated_at ASC
       LIMIT $2`,
      [sinceDate, limit],
    );

    for (const c of catRes.rows) {
      deltas.push({
        aggregateType: 'CATEGORY',
        aggregateId: c.id,
        eventType: 'UPDATED',
        data: {
          id: c.id,
          code: c.code,
          nameEn: c.name_en,
          nameAm: c.name_am,
          isActive: c.is_active,
        },
        updatedAt: c.updated_at.toISOString(),
      });
    }

    // 2. Products
    const prodRes = await this.db.query<any>(
      `SELECT id, sku, name_en, name_am, category_id, uom_code,
              base_price, cost_price, is_vat_applicable, vat_rate,
              is_weighed, scale_plu, min_stock_level, is_active, updated_at
       FROM products
       WHERE updated_at > $1
       ORDER BY updated_at ASC
       LIMIT $2`,
      [sinceDate, limit],
    );

    for (const p of prodRes.rows) {
      deltas.push({
        aggregateType: 'PRODUCT',
        aggregateId: p.id,
        eventType: 'UPDATED',
        data: {
          id: p.id,
          sku: p.sku,
          nameEn: p.name_en,
          nameAm: p.name_am,
          categoryId: p.category_id,
          uomCode: p.uom_code,
          basePrice: parseFloat(p.base_price),
          costPrice: parseFloat(p.cost_price),
          isVatApplicable: p.is_vat_applicable,
          vatRate: parseFloat(p.vat_rate),
          isWeighed: p.is_weighed,
          scalePlu: p.scale_plu,
          minStockLevel: parseFloat(p.min_stock_level),
          isActive: p.is_active,
        },
        updatedAt: p.updated_at.toISOString(),
      });
    }

    // 3. Suppliers
    const supRes = await this.db.query<any>(
      `SELECT id, code, name, tin_number, vat_number, contact_person,
              phone, email, address, payment_terms_days, is_active, updated_at
       FROM suppliers
       WHERE updated_at > $1
       ORDER BY updated_at ASC
       LIMIT $2`,
      [sinceDate, limit],
    );

    for (const s of supRes.rows) {
      deltas.push({
        aggregateType: 'SUPPLIER',
        aggregateId: s.id,
        eventType: 'UPDATED',
        data: {
          id: s.id,
          code: s.code,
          name: s.name,
          tinNumber: s.tin_number,
          vatNumber: s.vat_number,
          contactPerson: s.contact_person,
          phone: s.phone,
          email: s.email,
          address: s.address,
          paymentTermsDays: s.payment_terms_days,
          isActive: s.is_active,
        },
        updatedAt: s.updated_at.toISOString(),
      });
    }

    return {
      branchId,
      deltas,
      syncedUntil: new Date().toISOString(),
      hasMore: deltas.length >= limit * 3,
    };
  }
}
