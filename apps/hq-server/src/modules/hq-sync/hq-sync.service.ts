import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
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
   * Ingests a push batch from a branch into sync_inbox with idempotency,
   * Authority Matrix evaluation, and multi-tenant isolation.
   */
  async processBranchPush(
    req: SyncBatchPushRequest,
    authenticatedTenantId?: string,
    authenticatedBranchId?: string,
  ): Promise<SyncBatchPushResponse> {
    const acknowledgedEventIds: string[] = [];
    const failedEventIds: string[] = [];
    const conflicts: ConflictRecord[] = [];

    // Verify pushing branch matches authenticated credentials
    if (authenticatedBranchId && req.sourceBranchId && req.sourceBranchId !== authenticatedBranchId) {
      throw new ForbiddenException(
        `Branch mismatch: credentials are for branch ${authenticatedBranchId} but batch payload specifies ${req.sourceBranchId}`,
      );
    }

    const tenantId = authenticatedTenantId || req.tenantId;

    await this.db.withTransaction(async (client) => {
      for (const event of req.events) {
        // Evaluate event against Authority Matrix and Tenant Boundary
        const evalResult = ConflictResolver.evaluateBranchEvent(event, tenantId);

        if (!evalResult.accepted) {
          const conflict = ConflictResolver.createConflictRecord(event, evalResult);
          conflicts.push(conflict);
          failedEventIds.push(event.id);
          continue;
        }

        // Idempotently ingest event into sync_inbox
        if (tenantId) {
          await client.query(
            `INSERT INTO sync_inbox (
               tenant_id, source_branch_id, event_id, idempotency_key,
               aggregate_type, event_type, payload, status, conflict_resolution
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'APPLIED', $8)
             ON CONFLICT (idempotency_key) DO UPDATE
             SET processed_at = clock_timestamp()`,
            [
              tenantId,
              req.sourceBranchId,
              event.id,
              event.idempotencyKey,
              event.aggregateType,
              event.eventType,
              JSON.stringify(event.payload),
              evalResult.policy,
            ],
          );
        } else {
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
        }

        if (event.aggregateType === 'USER' && event.payload) {
          try {
            await client.query(
              `UPDATE users SET
                 is_active = COALESCE($1, is_active),
                 token_version = token_version + 1,
                 updated_at = clock_timestamp()
               WHERE id = $2`,
              [event.payload.isActive !== undefined ? event.payload.isActive : null, event.aggregateId],
            );
          } catch {
            // ignore if user schema differs
          }
        }

        acknowledgedEventIds.push(event.id);
      }
    }, tenantId);

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
   * Provides catalog deltas for branches to pull, scoped to the branch's tenant.
   */
  async getCatalogDeltas(
    branchId: string,
    lastSyncedAt?: string | null,
    limit = 100,
    tenantId?: string,
  ): Promise<SyncPullResponse> {
    const sinceDate = lastSyncedAt ? new Date(lastSyncedAt) : new Date(0);
    const deltas: CatalogDeltaItem[] = [];

    // 1. Categories
    const catQuery = tenantId
      ? `SELECT id, code, name_en, name_am, is_active, updated_at
         FROM categories
         WHERE tenant_id = $1 AND updated_at > $2
         ORDER BY updated_at ASC
         LIMIT $3`
      : `SELECT id, code, name_en, name_am, is_active, updated_at
         FROM categories
         WHERE updated_at > $1
         ORDER BY updated_at ASC
         LIMIT $2`;
    const catParams = tenantId ? [tenantId, sinceDate, limit] : [sinceDate, limit];
    const catRes = await this.db.query<any>(catQuery, catParams, tenantId);

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
    const prodQuery = tenantId
      ? `SELECT id, sku, name_en, name_am, category_id, uom_code,
                base_price, cost_price, is_vat_applicable, vat_rate,
                is_weighed, scale_plu, min_stock_level, is_active, updated_at
         FROM products
         WHERE tenant_id = $1 AND updated_at > $2
         ORDER BY updated_at ASC
         LIMIT $3`
      : `SELECT id, sku, name_en, name_am, category_id, uom_code,
                base_price, cost_price, is_vat_applicable, vat_rate,
                is_weighed, scale_plu, min_stock_level, is_active, updated_at
         FROM products
         WHERE updated_at > $1
         ORDER BY updated_at ASC
         LIMIT $2`;
    const prodParams = tenantId ? [tenantId, sinceDate, limit] : [sinceDate, limit];
    const prodRes = await this.db.query<any>(prodQuery, prodParams, tenantId);

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
    const supQuery = tenantId
      ? `SELECT id, code, name, tin_number, vat_number, contact_person,
                phone, email, address, payment_terms_days, is_active, updated_at
         FROM suppliers
         WHERE tenant_id = $1 AND updated_at > $2
         ORDER BY updated_at ASC
         LIMIT $3`
      : `SELECT id, code, name, tin_number, vat_number, contact_person,
                phone, email, address, payment_terms_days, is_active, updated_at
         FROM suppliers
         WHERE updated_at > $1
         ORDER BY updated_at ASC
         LIMIT $2`;
    const supParams = tenantId ? [tenantId, sinceDate, limit] : [sinceDate, limit];
    const supRes = await this.db.query<any>(supQuery, supParams, tenantId);

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

    // 4. Users (Hashes and permissions only, scoped to tenant)
    try {
      const userQuery = tenantId
        ? `SELECT u.id, u.tenant_id, u.username, u.full_name, u.email, u.phone,
                  u.role_id, r.name as role_name, u.default_branch_id, u.is_active,
                  u.password_hash, u.pin_hash, u.pin_salt, u.token_version,
                  u.requires_totp, u.totp_secret_encrypted, u.updated_at
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.tenant_id = $1 AND u.updated_at > $2
           ORDER BY u.updated_at ASC
           LIMIT $3`
        : `SELECT u.id, u.tenant_id, u.username, u.full_name, u.email, u.phone,
                  u.role_id, r.name as role_name, u.default_branch_id, u.is_active,
                  u.password_hash, u.pin_hash, u.pin_salt, u.token_version,
                  u.requires_totp, u.totp_secret_encrypted, u.updated_at
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE u.updated_at > $1
           ORDER BY u.updated_at ASC
           LIMIT $2`;
      const userParams = tenantId ? [tenantId, sinceDate, limit] : [sinceDate, limit];
      const userRes = await this.db.query<any>(userQuery, userParams, tenantId);

      for (const u of userRes.rows) {
        deltas.push({
          aggregateType: 'USER',
          aggregateId: u.id,
          eventType: 'UPDATED',
          data: {
            id: u.id,
            tenantId: u.tenant_id,
            username: u.username,
            fullName: u.full_name,
            email: u.email,
            phone: u.phone,
            roleId: u.role_id,
            roleName: u.role_name,
            defaultBranchId: u.default_branch_id,
            isActive: u.is_active,
            passwordHash: u.password_hash,
            pinHash: u.pin_hash,
            pinSalt: u.pin_salt,
            tokenVersion: u.token_version || 1,
            requiresTotp: u.requires_totp ?? false,
            totpSecretEncrypted: u.totp_secret_encrypted,
          },
          updatedAt: u.updated_at.toISOString(),
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not pull user deltas: ${err.message}`);
    }

    // 5. Roles
    try {
      const roleQuery = `SELECT id, name, description, is_system, max_discount_percentage, updated_at
                         FROM roles
                         WHERE updated_at > $1
                         ORDER BY updated_at ASC
                         LIMIT $2`;
      const roleRes = await this.db.query<any>(roleQuery, [sinceDate, limit]);
      for (const r of roleRes.rows) {
        deltas.push({
          aggregateType: 'ROLE',
          aggregateId: r.id,
          eventType: 'UPDATED',
          data: {
            id: r.id,
            name: r.name,
            description: r.description,
            isSystem: r.is_system,
            maxDiscountPercentage: parseFloat(r.max_discount_percentage || '0'),
          },
          updatedAt: r.updated_at.toISOString(),
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not pull role deltas: ${err.message}`);
    }

    return {
      branchId,
      deltas,
      syncedUntil: new Date().toISOString(),
      hasMore: deltas.length >= limit * 3,
    };
  }
}
