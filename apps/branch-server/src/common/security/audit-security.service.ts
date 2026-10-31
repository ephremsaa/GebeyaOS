import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { generateUuidV7 } from '@gebeyaos/shared-types';

export type AuthActionResult = 'SUCCESS' | 'FAILURE' | 'LOCKOUT';

export interface AuditEventParams {
  tenantId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  entityName?: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  result?: AuthActionResult;
  details?: Record<string, any>;
}

export interface PlatformAuditParams {
  adminId: string;
  action: string;
  tenantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  result?: AuthActionResult;
  details?: Record<string, any>;
}

@Injectable()
export class AuditSecurityService {
  private readonly logger = new Logger(AuditSecurityService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Sanitizes details object to ensure passwords, PINs, and raw tokens are NEVER logged
   */
  private sanitizeDetails(details?: Record<string, any>): Record<string, any> {
    if (!details) return {};
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(details)) {
      const lower = key.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('pin') ||
        lower.includes('secret') ||
        lower.includes('token')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }

  /**
   * Log tenant-scoped authentication or security action
   */
  async logAuthEvent(params: AuditEventParams): Promise<void> {
    const safeDetails = this.sanitizeDetails(params.details);
    const result = params.result || 'SUCCESS';
    const auditId = generateUuidV7();

    try {
      await this.db.query(
        `INSERT INTO audit_logs (id, tenant_id, branch_id, user_id, action, entity_name, entity_id, ip_address, user_agent, result, details, sync_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')`,
        [
          auditId,
          params.tenantId || null,
          params.branchId || null,
          params.userId || null,
          params.action,
          params.entityName || 'auth',
          params.entityId || params.userId || null,
          params.ipAddress || null,
          params.userAgent || null,
          result,
          JSON.stringify(safeDetails),
        ],
        params.tenantId || undefined,
      );

      // In offline or online mode, queue auth audit events into sync_outbox for HQ sync
      const effectiveBranchId = params.branchId || null;
      const idempotencyKey = `AUDIT:${auditId}`;
      await this.db.query(
        `INSERT INTO sync_outbox (
           id, branch_id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
         ) VALUES ($1, $2, $3, 'AUDIT_LOG', $4, 'CREATED', $5, $6, 'PENDING')
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          generateUuidV7(),
          effectiveBranchId,
          params.tenantId || null,
          auditId,
          JSON.stringify({
            auditId,
            tenantId: params.tenantId,
            branchId: params.branchId,
            userId: params.userId,
            action: params.action,
            entityName: params.entityName || 'auth',
            entityId: params.entityId || params.userId,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            result,
            details: safeDetails,
            timestamp: new Date().toISOString(),
          }),
          idempotencyKey,
        ],
        params.tenantId || undefined,
      );
    } catch (err: any) {
      this.logger.error(`Failed to write audit log: ${err.message}`);
    }
  }

  /**
   * Log platform administrator action
   */
  async logPlatformEvent(params: PlatformAuditParams): Promise<void> {
    const safeDetails = this.sanitizeDetails(params.details);
    const result = params.result || 'SUCCESS';

    try {
      await this.db.query(
        `INSERT INTO platform_audit_logs (id, admin_id, action, tenant_id, ip_address, user_agent, result, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          generateUuidV7(),
          params.adminId,
          params.action,
          params.tenantId || null,
          params.ipAddress || null,
          params.userAgent || null,
          result,
          JSON.stringify(safeDetails),
        ],
      );
    } catch (err: any) {
      this.logger.error(`Failed to write platform audit log: ${err.message}`);
    }
  }
}

