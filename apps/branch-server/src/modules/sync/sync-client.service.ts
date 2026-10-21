import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { SyncOutboxService } from './sync-outbox.service';
import {
  PacketBuilder,
  SyncBatchPushRequest,
  SyncBatchPushResponse,
  SyncPullResponse,
  CatalogDeltaItem,
} from '@gebeyaos/sync-protocol';

@Injectable()
export class SyncClientService {
  private readonly logger = new Logger(SyncClientService.name);
  private consecutiveFailures = 0;
  private lastSyncAttempt: string | null = null;
  private isSyncing = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: SyncOutboxService,
  ) {}

  /**
   * Pushes pending outbox events to Central HQ in batches.
   */
  async pushPendingEvents(
    branchId: string,
    limit = 100,
    transport?: (req: SyncBatchPushRequest) => Promise<SyncBatchPushResponse>,
  ): Promise<{ pushedCount: number; ackCount: number; conflictsCount: number }> {
    if (this.isSyncing) {
      return { pushedCount: 0, ackCount: 0, conflictsCount: 0 };
    }

    this.isSyncing = true;
    this.lastSyncAttempt = new Date().toISOString();

    try {
      const events = await this.outbox.getPendingBatch(branchId, limit);
      if (events.length === 0) {
        return { pushedCount: 0, ackCount: 0, conflictsCount: 0 };
      }

      const batch = PacketBuilder.buildPushBatch(branchId, events);

      // Execute push via transport adapter or HTTP POST
      let response: SyncBatchPushResponse;
      if (transport) {
        response = await transport(batch);
      } else {
        response = await this.httpPush(batch);
      }

      if (response.success) {
        await this.outbox.acknowledgeBatch(response.acknowledgedEventIds);
        this.consecutiveFailures = 0;

        if (response.failedEventIds && response.failedEventIds.length > 0) {
          await this.outbox.recordBatchFailures(
            response.failedEventIds,
            'Rejected by HQ',
          );
        }

        return {
          pushedCount: events.length,
          ackCount: response.acknowledgedEventIds.length,
          conflictsCount: response.conflicts ? response.conflicts.length : 0,
        };
      } else {
        const eventIds = events.map((e) => e.id);
        await this.outbox.recordBatchFailures(eventIds, 'Push rejected by HQ');
        this.consecutiveFailures++;
        return { pushedCount: 0, ackCount: 0, conflictsCount: 0 };
      }
    } catch (err: any) {
      this.consecutiveFailures++;
      this.logger.warn(
        `Sync push failed (offline or HQ unreachable, failures: ${this.consecutiveFailures}): ${err.message}`,
      );
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pulls catalog deltas from Central HQ and applies them locally.
   */
  async pullCatalogDeltas(
    branchId: string,
    transport?: () => Promise<SyncPullResponse>,
  ): Promise<{ appliedCount: number; syncedUntil: string }> {
    let pullData: SyncPullResponse;
    if (transport) {
      pullData = await transport();
    } else {
      pullData = await this.httpPull(branchId);
    }

    let appliedCount = 0;
    await this.db.withTransaction(async (client) => {
      for (const delta of pullData.deltas) {
        await this.applyCatalogDelta(client, delta);
        appliedCount++;
      }
    });

    return {
      appliedCount,
      syncedUntil: pullData.syncedUntil,
    };
  }

  /**
   * Applies an individual catalog delta from HQ locally.
   */
  private async applyCatalogDelta(client: any, delta: CatalogDeltaItem) {
    const { aggregateType, data } = delta;

    if (aggregateType === 'CATEGORY') {
      await client.query(
        `INSERT INTO categories (id, code, name_en, name_am, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           name_en = EXCLUDED.name_en,
           name_am = EXCLUDED.name_am,
           is_active = EXCLUDED.is_active,
           updated_at = clock_timestamp()`,
        [data.id, data.code, data.nameEn, data.nameAm || null, data.isActive ?? true],
      );
    } else if (aggregateType === 'PRODUCT') {
      await client.query(
        `INSERT INTO products (
           id, sku, name_en, name_am, category_id, uom_code,
           base_price, cost_price, is_vat_applicable, vat_rate,
           is_weighed, scale_plu, min_stock_level, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           sku = EXCLUDED.sku,
           name_en = EXCLUDED.name_en,
           name_am = EXCLUDED.name_am,
           category_id = EXCLUDED.category_id,
           uom_code = EXCLUDED.uom_code,
           base_price = EXCLUDED.base_price,
           cost_price = EXCLUDED.cost_price,
           is_vat_applicable = EXCLUDED.is_vat_applicable,
           vat_rate = EXCLUDED.vat_rate,
           is_weighed = EXCLUDED.is_weighed,
           scale_plu = EXCLUDED.scale_plu,
           min_stock_level = EXCLUDED.min_stock_level,
           is_active = EXCLUDED.is_active,
           updated_at = clock_timestamp()`,
        [
          data.id,
          data.sku,
          data.nameEn,
          data.nameAm || null,
          data.categoryId,
          data.uomCode || 'PCS',
          data.basePrice,
          data.costPrice || 0,
          data.isVatApplicable ?? true,
          data.vatRate ?? 0.15,
          data.isWeighed ?? false,
          data.scalePlu || null,
          data.minStockLevel || 0,
          data.isActive ?? true,
        ],
      );
    } else if (aggregateType === 'SUPPLIER') {
      await client.query(
        `INSERT INTO suppliers (
           id, code, name, tin_number, vat_number, contact_person,
           phone, email, address, payment_terms_days, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           name = EXCLUDED.name,
           tin_number = EXCLUDED.tin_number,
           vat_number = EXCLUDED.vat_number,
           contact_person = EXCLUDED.contact_person,
           phone = EXCLUDED.phone,
           email = EXCLUDED.email,
           address = EXCLUDED.address,
           payment_terms_days = EXCLUDED.payment_terms_days,
           is_active = EXCLUDED.is_active,
           updated_at = clock_timestamp()`,
        [
          data.id,
          data.code,
          data.name,
          data.tinNumber || null,
          data.vatNumber || null,
          data.contactPerson || null,
          data.phone,
          data.email || null,
          data.address || null,
          data.paymentTermsDays || 0,
          data.isActive ?? true,
        ],
      );
    }
  }

  private async httpPush(req: SyncBatchPushRequest): Promise<SyncBatchPushResponse> {
    const hqUrl = process.env.HQ_URL || 'http://localhost:4000';
    const res = await fetch(`${hqUrl}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`HQ sync push responded with status ${res.status}`);
    }

    return res.json() as Promise<SyncBatchPushResponse>;
  }

  private async httpPull(branchId: string): Promise<SyncPullResponse> {
    const hqUrl = process.env.HQ_URL || 'http://localhost:4000';
    const res = await fetch(`${hqUrl}/sync/pull/catalog?branchId=${branchId}`);

    if (!res.ok) {
      throw new Error(`HQ sync pull responded with status ${res.status}`);
    }

    return res.json() as Promise<SyncPullResponse>;
  }

  /**
   * Returns client sync status and backoff information.
   */
  getSyncStatus() {
    // Exponential backoff delay calculation
    const backoffMs = Math.min(60000, 1000 * Math.pow(2, this.consecutiveFailures));
    return {
      isOnline: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      backoffDelayMs: backoffMs,
      lastSyncAttempt: this.lastSyncAttempt,
    };
  }
}
