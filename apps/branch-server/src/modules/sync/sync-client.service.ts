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
  private lastHqContact: string | null = new Date().toISOString();
  private isSyncing = false;
  private catalogVersion = 'v18.4';
  private clockSkewSeconds = 0;

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

        // Also mark matching audit_logs as SYNCED
        try {
          await this.db.query(
            `UPDATE audit_logs SET sync_status = 'SYNCED', synced_at = clock_timestamp()
             WHERE id = ANY(
               SELECT aggregate_id::uuid FROM sync_outbox WHERE id = ANY($1) AND aggregate_type = 'AUDIT_LOG'
             )`,
            [response.acknowledgedEventIds],
          );
        } catch {
          // non-fatal
        }

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
    } else if (aggregateType === 'ROLE') {
      await client.query(
        `INSERT INTO roles (id, name, description, is_system, max_discount_percentage)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           is_system = EXCLUDED.is_system,
           max_discount_percentage = EXCLUDED.max_discount_percentage,
           updated_at = clock_timestamp()`,
        [
          data.id,
          data.name,
          data.description || null,
          data.isSystem ?? false,
          data.maxDiscountPercentage || 0,
        ],
      );
    } else if (aggregateType === 'USER') {
      await client.query(
        `INSERT INTO users (
           id, tenant_id, username, full_name, email, phone,
           role_id, default_branch_id, is_active, password_hash,
           pin_hash, pin_salt, token_version, requires_totp, totp_secret_encrypted
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'UNSET'), $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           full_name = COALESCE(EXCLUDED.full_name, users.full_name),
           email = COALESCE(EXCLUDED.email, users.email),
           phone = COALESCE(EXCLUDED.phone, users.phone),
           role_id = COALESCE(EXCLUDED.role_id, users.role_id),
           default_branch_id = COALESCE(EXCLUDED.default_branch_id, users.default_branch_id),
           is_active = COALESCE(EXCLUDED.is_active, users.is_active),
           password_hash = CASE WHEN EXCLUDED.password_hash = 'UNSET' THEN users.password_hash ELSE EXCLUDED.password_hash END,
           pin_hash = COALESCE(EXCLUDED.pin_hash, users.pin_hash),
           pin_salt = COALESCE(EXCLUDED.pin_salt, users.pin_salt),
           token_version = COALESCE(EXCLUDED.token_version, users.token_version),
           requires_totp = COALESCE(EXCLUDED.requires_totp, users.requires_totp),
           totp_secret_encrypted = COALESCE(EXCLUDED.totp_secret_encrypted, users.totp_secret_encrypted),
           updated_at = clock_timestamp()`,
        [
          data.id,
          data.tenantId,
          data.username,
          data.fullName,
          data.email || null,
          data.phone || null,
          data.roleId,
          data.defaultBranchId || null,
          data.isActive ?? true,
          data.passwordHash || null,
          data.pinHash || null,
          data.pinSalt || null,
          data.tokenVersion || 1,
          data.requiresTotp ?? false,
          data.totpSecretEncrypted || null,
        ],
      );

      // If user was deactivated or token invalidated at HQ, immediately revoke active sessions
      if (data.isActive === false) {
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
          [data.id],
        );
      }
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
   * Evaluates clock skew between branch clock and HQ server-assigned sequence timestamp.
   * If clock drift > 300 seconds (5 min), flags alert while preserving sequence-based ordering.
   */
  detectClockSkew(serverTimestamp?: string): { skewSeconds: number; isSkewed: boolean } {
    if (!serverTimestamp) {
      return { skewSeconds: this.clockSkewSeconds, isSkewed: Math.abs(this.clockSkewSeconds) > 300 };
    }
    const localMs = Date.now();
    const serverMs = new Date(serverTimestamp).getTime();
    this.clockSkewSeconds = Math.round((localMs - serverMs) / 1000);
    this.lastHqContact = new Date().toISOString();
    return {
      skewSeconds: this.clockSkewSeconds,
      isSkewed: Math.abs(this.clockSkewSeconds) > 300,
    };
  }

  /**
   * Forces an initial pull of the full master catalog for a newly provisioned branch.
   */
  async forceInitialCatalogPull(branchId: string): Promise<{ appliedCount: number; catalogVersion: string }> {
    const res = await this.pullCatalogDeltas(branchId);
    this.catalogVersion = `v${(parseFloat(this.catalogVersion.replace('v', '')) + 0.1).toFixed(1)}`;
    this.lastHqContact = new Date().toISOString();
    return {
      appliedCount: res.appliedCount,
      catalogVersion: this.catalogVersion,
    };
  }

  /**
   * Returns client sync status, clock skew, catalog version, and backoff information.
   */
  getSyncStatus() {
    // Exponential backoff delay calculation
    const backoffMs = Math.min(60000, 1000 * Math.pow(2, this.consecutiveFailures));

    // Health alert after N failed attempts
    let healthAlert: string | null = null;
    if (this.consecutiveFailures >= 5) {
      healthAlert = `Warning: HQ sync has encountered ${this.consecutiveFailures} consecutive network failures. Sales are safely saved locally and will sync when connectivity resumes.`;
    }

    return {
      isOnline: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      backoffDelayMs: backoffMs,
      lastSyncAttempt: this.lastSyncAttempt,
      lastHqContact: this.lastHqContact,
      catalogVersion: this.catalogVersion,
      clockSkewSeconds: this.clockSkewSeconds,
      isClockSkewed: Math.abs(this.clockSkewSeconds) > 300,
      healthAlert,
    };
  }
}
