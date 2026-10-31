import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../src/common/database/database.service';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { PlatformAdminService } from '../../src/modules/platform-admin/platform-admin.service';
import { PlatformAdminGuard } from '../../src/modules/platform-admin/guards/platform-admin.guard';
import { JwtAuthGuard, JWT_SECRET } from '../../src/common/guards/jwt-auth.guard';
import { PLATFORM_JWT_SECRET } from '../../src/common/security/token.service';
import { TotpService } from '../../src/common/security/totp.service';

describe('Platform Admin Service & Isolation (Step 3)', () => {
  let platformService: PlatformAdminService;
  let platformGuard: PlatformAdminGuard;
  let jwtGuard: JwtAuthGuard;
  let db: DatabaseService;
  let tenantContextService: TenantContextService;

  beforeAll(async () => {
    process.env.DB_NAME = 'gebeyaos_test';
    tenantContextService = new TenantContextService();
    db = new DatabaseService(tenantContextService);
    db.onModuleInit();

    platformService = new PlatformAdminService(db);
    platformGuard = new PlatformAdminGuard(db);
    jwtGuard = new JwtAuthGuard(db, tenantContextService);
  });

  afterAll(async () => {
    if (db) {
      await db.onModuleDestroy();
    }
  });

  describe('1. Platform Admin Authentication & Security', () => {
    it('rejects invalid password with UnauthorizedException', async () => {
      await expect(
        platformService.login({
          username: 'platform_admin',
          password: 'WrongPassword999!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects non-existent username with UnauthorizedException', async () => {
      await expect(
        platformService.login({
          username: 'unknown_operator',
          password: 'PlatformAdmin2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('authenticates valid platform admin and returns signed platform JWT after 2FA', async () => {
      const loginInit = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });

      expect(loginInit.requires2fa).toBe(true);
      expect(loginInit.tempToken).toBeDefined();

      const totpService = new TotpService();
      let code: string;
      if (loginInit.isEnrollment && loginInit.secret) {
        code = totpService.generateCode(loginInit.secret);
      } else {
        const adminRow = await db.query(
          `SELECT totp_secret_encrypted FROM platform_admins WHERE username = 'platform_admin'`,
        );
        const secret = totpService.decryptSecret(adminRow.rows[0].totp_secret_encrypted);
        code = totpService.generateCode(secret);
      }

      const res = await platformService.verify2Fa({
        tempToken: loginInit.tempToken,
        code,
      });

      expect(res.accessToken).toBeDefined();
      expect(res.admin.username).toBe('platform_admin');
      expect(res.admin.email).toBe('admin@gebeyaos.et');

      // Verify JWT claims
      const decoded: any = jwt.verify(res.accessToken, PLATFORM_JWT_SECRET);
      expect(decoded.isPlatformAdmin).toBe(true);
      expect(decoded.role).toBe('SUPER_ADMIN');
      expect(decoded.sub).toBe(res.admin.id);

      // Verify PLATFORM_LOGIN_SUCCESS logged to platform_audit_logs
      const audit = await db.query(
        `SELECT action, admin_id FROM platform_audit_logs WHERE admin_id = $1 AND action = 'PLATFORM_LOGIN_SUCCESS' ORDER BY created_at DESC LIMIT 1`,
        [res.admin.id],
      );
      expect(audit.rows.length).toBe(1);
    });

    it('PlatformAdminGuard denies regular tenant user tokens', async () => {
      const fakeTenantUserToken = jwt.sign(
        {
          sub: '01900000-0000-7000-8000-000000000001',
          tenantId: '01900000-0000-7000-8000-000000000001',
          role: 'OWNER',
          isPlatformAdmin: false,
        },
        JWT_SECRET,
      );

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${fakeTenantUserToken}` },
          }),
        }),
      };

      await expect(platformGuard.canActivate(mockContext)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Tenant Listing & Data Privacy Guarantee', () => {
    it('returns tenant list with operational metadata, strictly omitting business data', async () => {
      const tenants = await platformService.getTenants();
      expect(tenants.length).toBeGreaterThanOrEqual(2);

      const kerod = tenants.find((t) => t.slug === 'kerod');
      expect(kerod).toBeDefined();
      expect(kerod!.name).toBe('Kerod Supermarket');
      expect(kerod!.status).toBe('active');
      expect(kerod!.branchCount).toBeGreaterThanOrEqual(1);
      expect(typeof kerod!.maxBranches).toBe('number');
      expect(typeof kerod!.maxTerminals).toBe('number');

      // STRICT PRIVACY ASSERTION:
      // Operational overview must never leak sales, prices, stock levels, or revenue
      for (const tenant of tenants) {
        expect((tenant as any).sales).toBeUndefined();
        expect((tenant as any).revenue).toBeUndefined();
        expect((tenant as any).prices).toBeUndefined();
        expect((tenant as any).products).toBeUndefined();
        expect((tenant as any).inventoryCost).toBeUndefined();
      }
    });
  });

  describe('3. Tenant Creation & Owner Onboarding', () => {
    const testSlug = `abyssinia-${Date.now()}`;
    let createdTenantId: string;

    it('creates a new tenant and generates an owner invitation token', async () => {
      const adminLogin = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });

      const result = await platformService.createTenant(
        {
          name: 'Abyssinia Mart',
          slug: testSlug,
          plan: 'growth',
          ownerName: 'Abebe Bikila',
          ownerEmailOrPhone: 'abebe@abyssiniamart.et',
          maxBranches: 5,
          maxTerminals: 10,
          maxUsers: 25,
        },
        adminLogin.admin.id,
      );

      expect(result.tenant.id).toBeDefined();
      expect(result.tenant.name).toBe('Abyssinia Mart');
      expect(result.tenant.slug).toBe(testSlug);
      expect(result.tenant.plan).toBe('growth');
      expect(result.inviteToken).toMatch(/^inv_/);
      expect(result.inviteLink).toContain(result.inviteToken);

      createdTenantId = result.tenant.id;

      // Verify invite link saved in DB
      const inviteRow = await db.query(
        `SELECT token, tenant_id, role_name FROM tenant_invite_links WHERE token = $1`,
        [result.inviteToken],
      );
      expect(inviteRow.rows.length).toBe(1);
      expect(inviteRow.rows[0].tenant_id).toBe(createdTenantId);
      expect(inviteRow.rows[0].role_name).toBe('OWNER');

      // Verify audit log
      const audit = await db.query(
        `SELECT action, tenant_id FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'TENANT_CREATE'`,
        [createdTenantId],
      );
      expect(audit.rows.length).toBe(1);
    });

    it('enforces slug uniqueness on tenant creation', async () => {
      const adminLogin = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });

      await expect(
        platformService.createTenant(
          {
            name: 'Duplicate Mart',
            slug: testSlug,
            plan: 'starter',
            ownerName: 'Duplicate Owner',
            ownerEmailOrPhone: 'dup@test.com',
          },
          adminLogin.admin.id,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Tenant Status Management & Suspension', () => {
    it('suspends and reactivates a tenant and logs actions', async () => {
      const adminLogin = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });

      const mayaId = '01900000-0000-7000-8000-000000000002';

      // 1. Suspend
      const suspended = await platformService.updateTenantStatus(
        mayaId,
        'suspended',
        adminLogin.admin.id,
      );
      expect(suspended.status).toBe('suspended');

      let audit = await db.query(
        `SELECT action FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'TENANT_SUSPEND'`,
        [mayaId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);

      // 2. Reactivate
      const reactivated = await platformService.updateTenantStatus(
        mayaId,
        'active',
        adminLogin.admin.id,
      );
      expect(reactivated.status).toBe('active');

      audit = await db.query(
        `SELECT action FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'TENANT_REACTIVATE'`,
        [mayaId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('5. Reset Owner Access', () => {
    it('generates a fresh invite link for the tenant and flags password change', async () => {
      const adminLogin = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });

      const kerodId = '01900000-0000-7000-8000-000000000001';
      const resetResult = await platformService.resetOwnerAccess(kerodId, adminLogin.admin.id);

      expect(resetResult.inviteToken).toMatch(/^inv_/);
      expect(resetResult.inviteLink).toContain(resetResult.inviteToken);

      const audit = await db.query(
        `SELECT action FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'OWNER_RESET'`,
        [kerodId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('6. Break-Glass Support Access & Auditing', () => {
    let supportSession: any;
    let adminId: string;
    const kerodId = '01900000-0000-7000-8000-000000000001';

    it('issues an audited, time-bound support access session', async () => {
      const adminLogin = await platformService.login({
        username: 'platform_admin',
        password: 'PlatformAdmin2026!',
      });
      adminId = adminLogin.admin.id;

      supportSession = await platformService.requestSupportAccess(
        kerodId,
        {
          reason: 'Investigating inventory reconciliation discrepancy requested by Kerod GM',
          durationHours: 2,
        },
        adminId,
      );

      expect(supportSession.id).toBeDefined();
      expect(supportSession.token).toBeDefined();
      expect(supportSession.tenantId).toBe(kerodId);

      // Verify audit log
      const audit = await db.query(
        `SELECT action, details FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'SUPPORT_ACCESS_GRANT' ORDER BY created_at DESC LIMIT 1`,
        [kerodId],
      );
      expect(audit.rows.length).toBe(1);
      expect(audit.rows[0].details.reason).toContain('Investigating inventory reconciliation');
    });

    it('allows JwtAuthGuard to accept support token and scope context to tenant', async () => {
      const mockReq: any = {
        headers: {
          authorization: `Bearer ${supportSession.token}`,
        },
      };
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      };

      const authorized = await jwtGuard.canActivate(mockContext);
      expect(authorized).toBe(true);
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.tenantId).toBe(kerodId);
      expect(mockReq.user.fullName).toContain('[Support Mode]');
    });

    it('revokes support access and subsequently rejects requests with revoked token', async () => {
      const revokeRes = await platformService.revokeSupportAccess(supportSession.id, adminId);
      expect(revokeRes.message).toContain('revoked');

      // Verify audit log
      const audit = await db.query(
        `SELECT action FROM platform_audit_logs WHERE tenant_id = $1 AND action = 'SUPPORT_ACCESS_REVOKED' ORDER BY created_at DESC LIMIT 1`,
        [kerodId],
      );
      expect(audit.rows.length).toBeGreaterThanOrEqual(1);

      // Subsequent request using this revoked token must fail
      const mockReq: any = {
        headers: {
          authorization: `Bearer ${supportSession.token}`,
        },
      };
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      };

      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('7. Platform Audit Log Inspection', () => {
    it('retrieves immutable audit records with admin and tenant names', async () => {
      const logs = await platformService.getAuditLogs(undefined, 20);
      expect(logs.length).toBeGreaterThan(0);

      const latest = logs[0];
      expect(latest.id).toBeDefined();
      expect(latest.adminUsername).toBe('platform_admin');
      expect(latest.action).toBeDefined();
      expect(latest.createdAt).toBeDefined();
    });
  });
});
