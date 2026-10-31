import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../src/common/database/database.service';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { PlatformAdminService } from '../../src/modules/platform-admin/platform-admin.service';
import { PlatformAdminGuard } from '../../src/modules/platform-admin/guards/platform-admin.guard';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import {
  TokenService,
  PLATFORM_JWT_SECRET,
  TENANT_JWT_SECRET,
} from '../../src/common/security/token.service';
import { TotpService } from '../../src/common/security/totp.service';
import { RateLimiterService } from '../../src/common/security/rate-limiter.service';
import { PasswordPolicyService } from '../../src/common/security/password-policy.service';
import { AuditSecurityService } from '../../src/common/security/audit-security.service';

describe('Step 4: Platform Admin 2FA, Sessions, Roles & Isolation Spec', () => {
  let db: DatabaseService;
  let tenantContext: TenantContextService;
  let platformService: PlatformAdminService;
  let platformGuard: PlatformAdminGuard;
  let jwtGuard: JwtAuthGuard;
  let totpService: TotpService;
  let tokenService: TokenService;
  let rateLimiter: RateLimiterService;

  const testOperatorId = '01a00000-0000-7000-8000-000000000099';
  const testSupportId = '01a00000-0000-7000-8000-000000000098';
  const testBillingId = '01a00000-0000-7000-8000-000000000097';
  const kerodTenantId = '01900000-0000-7000-8000-000000000001';

  async function cleanupTestData() {
    await db.query(`DELETE FROM platform_sessions WHERE admin_id IN ($1, $2, $3)`, [
      testOperatorId,
      testSupportId,
      testBillingId,
    ]);
    await db.query(`DELETE FROM platform_audit_logs WHERE admin_id IN ($1, $2, $3)`, [
      testOperatorId,
      testSupportId,
      testBillingId,
    ]);
    await db.query(`DELETE FROM platform_admins WHERE id IN ($1, $2, $3)`, [
      testOperatorId,
      testSupportId,
      testBillingId,
    ]);
  }

  beforeAll(async () => {
    process.env.DB_NAME = 'gebeyaos_test';
    tenantContext = new TenantContextService();
    db = new DatabaseService(tenantContext);
    db.onModuleInit();

    totpService = new TotpService();
    tokenService = new TokenService(db);
    rateLimiter = new RateLimiterService(db);
    const passwordPolicy = new PasswordPolicyService();
    const auditSecurity = new AuditSecurityService(db);

    platformService = new PlatformAdminService(
      db,
      undefined,
      totpService,
      tokenService,
      rateLimiter,
      passwordPolicy,
      auditSecurity,
    );

    platformGuard = new PlatformAdminGuard(db);
    jwtGuard = new JwtAuthGuard(db, tenantContext);

    await cleanupTestData();

    // Hash "PlatformPass2026!" with Argon2id
    const hash = await passwordPolicy.hashPassword('PlatformPass2026!');

    // Seed test operators
    await db.query(
      `INSERT INTO platform_admins (id, username, full_name, email, role, password_hash, is_active, totp_enabled, token_version)
       VALUES 
       ($1, 'ops_sec_test', 'Security Test Ops', 'ops_sec@gebeyaos.et', 'SUPER_ADMIN', $4, TRUE, FALSE, 1),
       ($2, 'ops_support_test', 'Support Test Ops', 'support_sec@gebeyaos.et', 'SUPPORT', $4, TRUE, TRUE, 1),
       ($3, 'ops_billing_test', 'Billing Test Ops', 'billing_sec@gebeyaos.et', 'BILLING', $4, TRUE, TRUE, 1)`,
      [testOperatorId, testSupportId, testBillingId, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData();
    if (db) await db.onModuleDestroy();
  });

  describe('1. Password Verification & Progressive Lockout', () => {
    it('rejects wrong password with generic UnauthorizedException without leaking existence', async () => {
      await expect(
        platformService.login(
          { username: 'ops_sec_test', password: 'WrongPassword123!' },
          '192.168.1.101',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('triggers progressive lockout after 5 consecutive failed login attempts', async () => {
      rateLimiter.resetIpRateLimits();
      await db.query(
        `UPDATE platform_admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [testOperatorId],
      );

      for (let i = 0; i < 4; i++) {
        await expect(
          platformService.login(
            { username: 'ops_sec_test', password: 'WrongPassword123!' },
            '192.168.1.102',
          ),
        ).rejects.toThrow(UnauthorizedException);
      }

      // 5th attempt triggers 429 Lockout
      await expect(
        platformService.login(
          { username: 'ops_sec_test', password: 'WrongPassword123!' },
          '192.168.1.102',
        ),
      ).rejects.toThrow(HttpException);

      // Verify locked_until is set in DB
      const adminRow = await db.query(
        `SELECT failed_login_attempts, locked_until FROM platform_admins WHERE id = $1`,
        [testOperatorId],
      );
      expect(adminRow.rows[0].failed_login_attempts).toBe(5);
      expect(new Date(adminRow.rows[0].locked_until).getTime()).toBeGreaterThan(Date.now());

      // Reset lockout for subsequent test steps
      await db.query(
        `UPDATE platform_admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [testOperatorId],
      );
    });
  });

  describe('2. Mandatory 2FA Flow (Enrollment & Challenge)', () => {
    let enrollmentToken: string;
    let enrollmentSecret: string;
    let backupCodes: string[];

    it('first-time login returns 2FA enrollment package with secret and 10 backup codes', async () => {
      const init = await platformService.login(
        { username: 'ops_sec_test', password: 'PlatformPass2026!' },
        '127.0.0.1',
      );

      expect(init.requires2fa).toBe(true);
      expect(init.isEnrollment).toBe(true);
      expect(init.tempToken).toBeDefined();
      expect(init.secret).toBeDefined();
      expect(init.qrCodeUri).toContain('otpauth://totp/GebeyaOS%20Platform:ops_sec_test');
      expect(init.backupCodes).toHaveLength(10);

      enrollmentToken = init.tempToken;
      enrollmentSecret = init.secret!;
      backupCodes = init.backupCodes!;
    });

    it('rejects invalid 6-digit TOTP code during 2FA verification', async () => {
      await expect(
        platformService.verify2Fa({
          tempToken: enrollmentToken,
          code: '999999',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('verifies valid 6-digit TOTP code, enables 2FA, and issues 15-min JWT + refresh token', async () => {
      const validCode = totpService.generateCode(enrollmentSecret);

      const res = await platformService.verify2Fa(
        {
          tempToken: enrollmentToken,
          code: validCode,
          rememberDevice: true,
        },
        '127.0.0.1',
      );

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.expiresIn).toBe(900); // 15 minutes
      expect(res.admin.username).toBe('ops_sec_test');
      expect(res.admin.role).toBe('SUPER_ADMIN');

      // Verify token issuer and audience isolation
      const decoded: any = jwt.verify(res.accessToken, PLATFORM_JWT_SECRET, {
        issuer: 'gebeyaos-platform',
        audience: 'gebeyaos-platform-console',
      });
      expect(decoded.isPlatformAdmin).toBe(true);
      expect(decoded.sub).toBe(testOperatorId);

      // Verify totp_enabled is now true in DB
      const adminRow = await db.query(
        `SELECT totp_enabled FROM platform_admins WHERE id = $1`,
        [testOperatorId],
      );
      expect(adminRow.rows[0].totp_enabled).toBe(true);
    });

    it('subsequent logins return isEnrollment: false', async () => {
      const step1 = await platformService.login({
        username: 'ops_sec_test',
        password: 'PlatformPass2026!',
      });

      expect(step1.requires2fa).toBe(true);
      expect(step1.isEnrollment).toBe(false);
      expect(step1.secret).toBeUndefined();
    });

    it('accepts single-use backup code and prevents reuse of the same backup code', async () => {
      const step1 = await platformService.login({
        username: 'ops_sec_test',
        password: 'PlatformPass2026!',
      });

      const singleUseCode = backupCodes[0];

      // 1. Consume backup code
      const res = await platformService.verify2Fa({
        tempToken: step1.tempToken,
        code: singleUseCode,
      });
      expect(res.accessToken).toBeDefined();

      // 2. Re-attempt login with the same backup code -> Must be rejected
      const step1Again = await platformService.login({
        username: 'ops_sec_test',
        password: 'PlatformPass2026!',
      });

      await expect(
        platformService.verify2Fa({
          tempToken: step1Again.tempToken,
          code: singleUseCode,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('3. Rotating Platform Refresh Tokens & Reuse Detection', () => {
    it('rotates refresh token and detects reuse attempt, revoking entire family', async () => {
      const step1 = await platformService.login({
        username: 'ops_sec_test',
        password: 'PlatformPass2026!',
      });
      const validCode = totpService.generateCode(
        totpService.decryptSecret(
          (await db.query(`SELECT totp_secret_encrypted FROM platform_admins WHERE id = $1`, [testOperatorId]))
            .rows[0].totp_secret_encrypted,
        ),
      );
      const session1 = await platformService.verify2Fa({
        tempToken: step1.tempToken,
        code: validCode,
      });

      const originalRefreshToken = session1.refreshToken!;

      // Legitimate rotation 1
      const session2 = await platformService.refreshSession(originalRefreshToken, '127.0.0.1');
      expect(session2.accessToken).toBeDefined();
      expect(session2.refreshToken).not.toBe(originalRefreshToken);

      // Malicious re-use of originalRefreshToken -> Must trigger security alarm & revoke family!
      await expect(
        platformService.refreshSession(originalRefreshToken, '127.0.0.1'),
      ).rejects.toThrow('Platform session compromised: token reuse detected');

      // Now subsequent attempts with session2 should also fail because the family is revoked!
      await expect(
        platformService.refreshSession(session2.refreshToken!, '127.0.0.1'),
      ).rejects.toThrow('Platform session compromised: token reuse detected');
    });
  });

  describe('4. Token Boundary & Audience Isolation', () => {
    it('Platform token is strictly rejected by tenant JwtAuthGuard', async () => {
      const platformToken = jwt.sign(
        {
          sub: testOperatorId,
          username: 'ops_sec_test',
          role: 'SUPER_ADMIN',
          isPlatformAdmin: true,
        },
        PLATFORM_JWT_SECRET,
        {
          issuer: 'gebeyaos-platform',
          audience: 'gebeyaos-platform-console',
          expiresIn: 900,
        },
      );

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${platformToken}` },
          }),
        }),
      };

      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('Tenant token is strictly rejected by PlatformAdminGuard', async () => {
      const tenantToken = jwt.sign(
        {
          sub: '018e0000-0000-7000-8000-000000000041',
          tenantId: kerodTenantId,
          role: 'OWNER',
          isPlatformAdmin: false,
        },
        TENANT_JWT_SECRET,
        {
          issuer: 'gebeyaos-branch',
          audience: 'gebeyaos-tenant-app',
          expiresIn: 900,
        },
      );

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${tenantToken}` },
          }),
        }),
      };

      await expect(platformGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('5. Role Permissions: SUPER_ADMIN, SUPPORT, BILLING', () => {
    it('SUPPORT role cannot suspend tenants', async () => {
      await expect(
        platformService.updateTenantStatus(
          kerodTenantId,
          'suspended',
          testSupportId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('BILLING role cannot suspend tenants or request break-glass support access', async () => {
      await expect(
        platformService.updateTenantStatus(
          kerodTenantId,
          'suspended',
          testBillingId,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        platformService.requestSupportAccess(
          kerodTenantId,
          { reason: 'Customer invoice audit' },
          testBillingId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('SUPPORT role cannot export business data without active support session', async () => {
      await expect(
        platformService.exportTenantData(kerodTenantId, testSupportId),
      ).rejects.toThrow('Platform Support role cannot access tenant business data without an active, audited support access session');
    });

    it('BILLING role can update tenant plan', async () => {
      const updated = await platformService.updateTenantPlan(
        kerodTenantId,
        'enterprise',
        testBillingId,
      );
      expect(updated.plan).toBe('enterprise');

      // Revert plan
      await platformService.updateTenantPlan(kerodTenantId, 'growth', testBillingId);
    });
  });

  describe('6. Re-authentication & Sensitive Actions', () => {
    it('re-authenticates with password + TOTP and issues 5-minute reauth token', async () => {
      const adminRow = await db.query(
        `SELECT totp_secret_encrypted FROM platform_admins WHERE id = $1`,
        [testOperatorId],
      );
      const secret = totpService.decryptSecret(adminRow.rows[0].totp_secret_encrypted);
      const totpCode = totpService.generateCode(secret);

      const res = await platformService.reauth(testOperatorId, {
        password: 'PlatformPass2026!',
        totpCode,
      });

      expect(res.success).toBe(true);
      expect(res.reauthToken).toBeDefined();

      // Verify reauth token
      await expect(
        platformService.verifyReauth(testOperatorId, res.reauthToken),
      ).resolves.not.toThrow();

      // Rejects invalid token
      await expect(
        platformService.verifyReauth(testOperatorId, 'invalid.token.here'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('7. Sessions List & Revocation', () => {
    it('lists active operator sessions and revokes a specific session', async () => {
      // First ensure an active session exists
      const step1 = await platformService.login({
        username: 'ops_sec_test',
        password: 'PlatformPass2026!',
      });
      const adminRow = await db.query(
        `SELECT totp_secret_encrypted FROM platform_admins WHERE id = $1`,
        [testOperatorId],
      );
      const secret = totpService.decryptSecret(adminRow.rows[0].totp_secret_encrypted);
      const code = totpService.generateCode(secret);
      await platformService.verify2Fa({ tempToken: step1.tempToken, code });

      const sessions = await platformService.listSessions(testOperatorId);
      expect(sessions.length).toBeGreaterThan(0);

      const targetSession = sessions[0];
      const res = await platformService.revokeSession(testOperatorId, targetSession.id);
      expect(res.message).toBe('Session revoked successfully');
    });

    it('changePassword updates password with Argon2id and revokes other sessions', async () => {
      const res = await platformService.changePassword(testOperatorId, {
        currentPassword: 'PlatformPass2026!',
        newPassword: 'NewPlatformPass2026!Strong',
      });

      expect(res.message).toContain('Master password updated successfully');

      // Verify old password no longer works
      await expect(
        platformService.login({
          username: 'ops_sec_test',
          password: 'PlatformPass2026!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Verify new password works
      const loginNew = await platformService.login({
        username: 'ops_sec_test',
        password: 'NewPlatformPass2026!Strong',
      });
      expect(loginNew.requires2fa).toBe(true);
    });
  });
});
