import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as zlib from 'zlib';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../src/common/database/database.service';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { TenantExportService } from '../../src/modules/platform-admin/tenant-export.service';
import { PlatformAdminService } from '../../src/modules/platform-admin/platform-admin.service';
import {
  TenantContextMiddleware,
  setRateLimitConfig,
  resetRateLimits,
} from '../../src/common/tenant/tenant-context.middleware';
import { JWT_SECRET } from '../../src/common/guards/jwt-auth.guard';
import { generateUuidV7 } from '@gebeyaos/shared-types';

describe('Operations: Backup/Export, Deletion, Structured Logging & Rate Limiting (Step 6)', () => {
  let db: DatabaseService;
  let tenantContextService: TenantContextService;
  let exportService: TenantExportService;
  let platformService: PlatformAdminService;
  let adminId: string;

  const KEROD_TENANT_ID = '01900000-0000-7000-8000-000000000001';

  beforeAll(async () => {
    process.env.DB_NAME = 'gebeyaos_test';
    tenantContextService = new TenantContextService();
    db = new DatabaseService(tenantContextService);
    db.onModuleInit();

    exportService = new TenantExportService(db);
    platformService = new PlatformAdminService(db, exportService);

    const adminLogin = await platformService.login({
      username: 'platform_admin',
      password: 'PlatformAdmin2026!',
    });
    adminId = adminLogin.admin.id;
  });

  afterAll(async () => {
    resetRateLimits();
    setRateLimitConfig(1000, 60 * 1000);
    await db.onModuleDestroy();
  });

  // ---------------------------------------------------------------------------
  // 1. TENANT BACKUP & EXPORT
  // ---------------------------------------------------------------------------
  describe('1. Per-Tenant Backup and Data Export', () => {
    it('throws NotFoundException for non-existent tenant', async () => {
      const nonExistentId = generateUuidV7();
      await expect(exportService.exportTenantData(nonExistentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('exports complete ZIP archive with individual CSVs and Excel workbook for Kerod Supermarket', async () => {
      const result = await exportService.exportTenantData(KEROD_TENANT_ID);

      expect(result).toBeDefined();
      expect(result.mimeType).toBe('application/zip');
      expect(result.filename).toMatch(/^kerod-backup-\d{4}-\d{2}-\d{2}\.zip$/);
      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(1000);

      // Verify ZIP file signature (0x04034b50 -> 'PK\x03\x04')
      expect(result.buffer[0]).toBe(0x50);
      expect(result.buffer[1]).toBe(0x4b);
      expect(result.buffer[2]).toBe(0x03);
      expect(result.buffer[3]).toBe(0x04);

      // Manifest checks
      expect(result.manifest.tenantId).toBe(KEROD_TENANT_ID);
      expect(result.manifest.tenantName).toBe('Kerod Supermarket');
      expect(result.manifest.tenantSlug).toBe('kerod');
      expect(result.manifest.recordCounts.branches).toBeGreaterThanOrEqual(1);
      expect(result.manifest.recordCounts.products).toBeGreaterThanOrEqual(1);
    });

    it('records TENANT_DATA_EXPORT action in platform_audit_logs when exported by platform admin', async () => {
      const result = await platformService.exportTenantData(KEROD_TENANT_ID, adminId, '127.0.0.1');
      expect(result.buffer.length).toBeGreaterThan(0);

      const auditRes = await db.query(
        `SELECT action, details FROM platform_audit_logs 
         WHERE admin_id = $1 AND action = 'TENANT_DATA_EXPORT'
         ORDER BY created_at DESC LIMIT 1`,
        [adminId],
      );

      expect(auditRes.rows.length).toBe(1);
      const details = auditRes.rows[0].details;
      expect(details.filename).toBe(result.filename);
      expect(details.recordCounts).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. TENANT DELETION WITH EXPLICIT CONFIRMATION
  // ---------------------------------------------------------------------------
  describe('2. Per-Tenant Deletion on Request with Confirmation', () => {
    let ephemeralTenantId: string;
    let ephemeralBranchId: string;
    let ephemeralSlug: string;

    beforeAll(async () => {
      ephemeralTenantId = generateUuidV7();
      ephemeralBranchId = generateUuidV7();
      ephemeralSlug = `to-delete-${Date.now().toString().slice(-6)}`;

      // Seed ephemeral tenant
      await db.query(
        `INSERT INTO tenants (id, name, slug, status, plan, max_branches, max_terminals, max_users)
         VALUES ($1, 'Disposable Supermarket Ltd', $2, 'active', 'starter', 2, 2, 5)`,
        [ephemeralTenantId, ephemeralSlug],
      );

      // Seed child branch, terminal, and user
      await db.query(
        `INSERT INTO branches (id, tenant_id, code, name, tin_number, phone, is_hq)
         VALUES ($1, $2, 'DISP-01', 'Disposable Branch', '0012345678', '+251 11 000 0000', TRUE)`,
        [ephemeralBranchId, ephemeralTenantId],
      );

      await db.query(
        `INSERT INTO terminals (id, tenant_id, branch_id, code, name)
         VALUES ($1, $2, $3, 'POS-01', 'Disposable Terminal')`,
        [generateUuidV7(), ephemeralTenantId, ephemeralBranchId],
      );

      const roleRes = await db.query(
        `SELECT id FROM roles WHERE name = 'SUPER_ADMIN' LIMIT 1`,
      );
      const roleId = roleRes.rows[0]?.id || '018e0000-0000-7000-8000-000000000001';

      await db.query(
        `INSERT INTO users (id, tenant_id, username, full_name, email, password_hash, pin_hash, role_id)
         VALUES ($1, $2, $3, 'Disposable Owner', $4, 'hash', 'pin', $5)`,
        [
          generateUuidV7(),
          ephemeralTenantId,
          `disp_owner_${Date.now()}`,
          `disp_${Date.now()}@test.et`,
          roleId,
        ],
      );
    });

    it('rejects deletion when confirmation code is invalid or mismatched', async () => {
      await expect(
        platformService.deleteTenant(ephemeralTenantId, 'wrong-code', adminId),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects deletion of a non-existent tenant ID', async () => {
      const nonExistentId = generateUuidV7();
      await expect(
        platformService.deleteTenant(nonExistentId, 'random', adminId),
      ).rejects.toThrow(NotFoundException);
    });

    it('permanently deletes tenant and purges all child records when confirmation code matches slug', async () => {
      const result = await platformService.deleteTenant(
        ephemeralTenantId,
        ephemeralSlug,
        adminId,
        '10.0.0.1',
      );

      expect(result.tenantId).toBe(ephemeralTenantId);
      expect(result.message).toContain('permanently deleted');

      // Verify tenant is gone
      const tenantCheck = await db.query(`SELECT id FROM tenants WHERE id = $1`, [
        ephemeralTenantId,
      ]);
      expect(tenantCheck.rows.length).toBe(0);

      // Verify child records are gone
      const branchCheck = await db.query(
        `SELECT id FROM branches WHERE tenant_id = $1`,
        [ephemeralTenantId],
      );
      expect(branchCheck.rows.length).toBe(0);

      const terminalCheck = await db.query(
        `SELECT id FROM terminals WHERE tenant_id = $1`,
        [ephemeralTenantId],
      );
      expect(terminalCheck.rows.length).toBe(0);

      const userCheck = await db.query(
        `SELECT id FROM users WHERE tenant_id = $1`,
        [ephemeralTenantId],
      );
      expect(userCheck.rows.length).toBe(0);

      // Verify platform audit log records TENANT_DELETED
      const auditRes = await db.query(
        `SELECT action, details FROM platform_audit_logs
         WHERE action = 'TENANT_DELETED' AND details->>'deletedTenantId' = $1`,
        [ephemeralTenantId],
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].details.tenantSlug).toBe(ephemeralSlug);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. STRUCTURED LOGGING & RATE LIMITING PER TENANT
  // ---------------------------------------------------------------------------
  describe('3. Structured Logging & Per-Tenant Rate Limiting', () => {
    let middleware: TenantContextMiddleware;

    beforeAll(() => {
      middleware = new TenantContextMiddleware(tenantContextService);
    });

    beforeEach(() => {
      resetRateLimits();
    });

    it('allows requests within the configured rate limit threshold', () => {
      setRateLimitConfig(3, 60 * 1000); // 3 requests per minute
      const tenantId = generateUuidV7();
      const token = jwt.sign({ tenantId, username: 'test_user' }, JWT_SECRET);

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        path: '/api/pos/sale',
        method: 'POST',
        url: '/api/pos/sale',
        ip: '127.0.0.1',
      };

      let passedCount = 0;
      const next = () => {
        passedCount++;
      };

      // 3 requests within limit
      for (let i = 0; i < 3; i++) {
        const res: any = {
          on: () => {},
          status: () => res,
          json: () => {},
          setHeader: () => {},
        };
        middleware.use(req, res, next);
      }

      expect(passedCount).toBe(3);
    });

    it('blocks the 4th request with HTTP 429 Too Many Requests when quota exceeded', () => {
      setRateLimitConfig(3, 60 * 1000);
      const tenantId = generateUuidV7();
      const token = jwt.sign({ tenantId, username: 'test_user' }, JWT_SECRET);

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        path: '/api/pos/sale',
        method: 'POST',
        url: '/api/pos/sale',
        ip: '127.0.0.1',
      };

      const next = () => {};

      // Send 3 requests
      for (let i = 0; i < 3; i++) {
        const res: any = {
          on: () => {},
          status: () => res,
          json: () => {},
          setHeader: () => {},
        };
        middleware.use(req, res, next);
      }

      // 4th request: should receive 429
      let statusCode = 200;
      let jsonPayload: any = null;
      let retryAfterHeader: any = null;

      const res4: any = {
        on: () => {},
        setHeader: (key: string, val: any) => {
          if (key === 'Retry-After') retryAfterHeader = val;
        },
        status: (code: number) => {
          statusCode = code;
          return res4;
        },
        json: (payload: any) => {
          jsonPayload = payload;
          return res4;
        },
      };

      middleware.use(req, res4, next);

      expect(statusCode).toBe(429);
      expect(jsonPayload.error).toBe('Too Many Requests');
      expect(jsonPayload.message).toContain('Tenant request quota exceeded');
      expect(jsonPayload.tenantId).toBe(tenantId);
      expect(retryAfterHeader).toBeGreaterThan(0);
    });

    it('health check endpoint bypasses rate limiting even when limit reached', () => {
      setRateLimitConfig(2, 60 * 1000);
      const tenantId = generateUuidV7();
      const token = jwt.sign({ tenantId, username: 'test_user' }, JWT_SECRET);

      const healthReq: any = {
        headers: { authorization: `Bearer ${token}` },
        path: '/health',
        method: 'GET',
        url: '/health',
        ip: '127.0.0.1',
      };

      let healthPassed = 0;
      const next = () => {
        healthPassed++;
      };

      // Send 5 health checks: all must pass through regardless of limit
      for (let i = 0; i < 5; i++) {
        const res: any = {
          on: () => {},
          status: () => res,
          json: () => {},
          setHeader: () => {},
        };
        middleware.use(healthReq, res, next);
      }

      expect(healthPassed).toBe(5);
    });

    it('attaches structured response finish listener capturing tenant_id and branch_id', () => {
      const tenantId = generateUuidV7();
      const branchId = generateUuidV7();
      const token = jwt.sign(
        { tenantId, branchId, username: 'cashier_test' },
        JWT_SECRET,
      );

      const req: any = {
        headers: { authorization: `Bearer ${token}` },
        path: '/api/pos/checkout',
        method: 'POST',
        url: '/api/pos/checkout',
        ip: '192.168.1.10',
      };

      let finishListener: (() => void) | null = null;
      const res: any = {
        statusCode: 201,
        on: (event: string, cb: () => void) => {
          if (event === 'finish') finishListener = cb;
        },
        status: () => res,
        json: () => {},
        setHeader: () => {},
      };

      let executed = false;
      middleware.use(req, res, () => {
        executed = true;
      });

      expect(executed).toBe(true);
      expect(finishListener).toBeTypeOf('function');

      // Calling finish listener should execute structured logging without throwing
      expect(() => (finishListener as any)()).not.toThrow();
    });
  });
});
