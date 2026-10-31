import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from '../../src/modules/auth/auth.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { PasswordPolicyService } from '../../src/common/security/password-policy.service';
import { PinHasherService } from '../../src/common/security/pin-hasher.service';
import { TotpService } from '../../src/common/security/totp.service';
import { TokenService } from '../../src/common/security/token.service';
import { RateLimiterService } from '../../src/common/security/rate-limiter.service';
import { AuditSecurityService } from '../../src/common/security/audit-security.service';

describe('Cashier PIN Login & Terminal Pairing (Step 3)', () => {
  let authService: AuthService;
  let mockDb: any;
  let pinHasher: PinHasherService;
  let passwordPolicy: PasswordPolicyService;
  let totp: TotpService;
  let tokenService: TokenService;
  let rateLimiter: RateLimiterService;
  let auditSecurity: AuditSecurityService;

  const tenantId = '01900000-0000-7000-8000-000000000001';
  const branchId = '018e0000-0000-7000-8000-000000000020';
  const cashierId = '018e0000-0000-7000-8000-000000000042';
  const managerId = '018e0000-0000-7000-8000-000000000041';
  const terminalCode = 'POS-LANE-01';

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
    passwordPolicy = new PasswordPolicyService();
    pinHasher = new PinHasherService();
    totp = new TotpService();
    tokenService = new TokenService(mockDb as DatabaseService);
    rateLimiter = new RateLimiterService(mockDb as DatabaseService);
    auditSecurity = new AuditSecurityService(mockDb as DatabaseService);

    authService = new AuthService(
      mockDb as DatabaseService,
      passwordPolicy,
      pinHasher,
      totp,
      tokenService,
      rateLimiter,
      auditSecurity,
    );
  });

  describe('1. Cashier Roster for Lock Screen Avatar Tiles', () => {
    it('retrieves active cashiers without disclosing password or PIN hashes', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: cashierId,
            username: 'cashier1',
            full_name: 'Bethlehem Tadesse',
            phone: '+251 92 233 4455',
            role_name: 'CASHIER',
            default_branch_id: branchId,
            pin_locked_until: null,
          },
        ],
      });

      const cashiers = await authService.getCashiers(branchId, tenantId);
      expect(Array.isArray(cashiers)).toBe(true);
      expect(cashiers.length).toBe(1);

      const c = cashiers[0];
      expect(c.id).toBe(cashierId);
      expect(c.fullName).toBe('Bethlehem Tadesse');
      expect(c.isLocked).toBe(false);
      expect(c).not.toHaveProperty('pin_hash');
      expect(c).not.toHaveProperty('pin_salt');
      expect(c).not.toHaveProperty('password_hash');
    });
  });

  describe('2. Cashier PIN Authentication & Progressive Lockout', () => {
    it('successfully logs in with valid 4-digit PIN for selected cashier', async () => {
      const salt = pinHasher.generateSalt();
      const hash = await pinHasher.hashPin('2580', salt);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: cashierId,
            tenant_id: tenantId,
            tenant_name: 'Kerod Supermarket',
            tenant_slug: 'kerod',
            username: 'cashier1',
            full_name: 'Bethlehem Tadesse',
            phone: '+251 92 233 4455',
            pin_hash: hash,
            pin_salt: salt,
            pin_failed_attempts: 0,
            pin_locked_until: null,
            role_id: 'r-cashier',
            role_name: 'CASHIER',
            default_branch_id: branchId,
            branch_code: 'BOLE-01',
            branch_name: 'Bole Branch',
            is_active: true,
            force_password_change: false,
            locked_until: null,
            permissions: ['pos:sale:create', 'pos:sale:hold'],
          },
        ],
      });

      // reset failed attempts update
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // terminal lookup
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // refresh token insert
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const res = await authService.pinLogin({
        userId: cashierId,
        pin: '2580',
        terminalCode,
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.id).toBe(cashierId);
      expect(res.user.role).toBe('CASHIER');
    });

    it('rejects wrong PIN, increments failed attempts, and reports remaining tries', async () => {
      const salt = pinHasher.generateSalt();
      const hash = await pinHasher.hashPin('2580', salt);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: cashierId,
            tenant_id: tenantId,
            username: 'cashier1',
            pin_hash: hash,
            pin_salt: salt,
            pin_failed_attempts: 1,
            pin_locked_until: null,
            is_active: true,
            default_branch_id: branchId,
          },
        ],
      });

      // update failed attempts query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        authService.pinLogin({
          userId: cashierId,
          pin: '0000',
          terminalCode,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET pin_failed_attempts = $1 WHERE id = $2'),
        [2, cashierId],
      );
    });

    it('locks cashier PIN after 5 consecutive failed attempts for 5 minutes', async () => {
      const salt = pinHasher.generateSalt();
      const hash = await pinHasher.hashPin('2580', salt);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: cashierId,
            tenant_id: tenantId,
            username: 'cashier1',
            pin_hash: hash,
            pin_salt: salt,
            pin_failed_attempts: 4, // 5th failure
            pin_locked_until: null,
            is_active: true,
            default_branch_id: branchId,
          },
        ],
      });

      // update failed attempts & locked_until query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      try {
        await authService.pinLogin({
          userId: cashierId,
          pin: '9999',
          terminalCode,
        });
        expect.fail('Should have thrown HttpException');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const body = err.getResponse();
        expect(body.error).toBe('PIN Locked');
        expect(body.remainingSeconds).toBe(300);
      }

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET pin_failed_attempts = $1, pin_locked_until = $2 WHERE id = $3'),
        expect.arrayContaining([5, expect.any(Date), cashierId]),
      );
    });

    it('blocks attempt when user PIN is already locked', async () => {
      const futureLock = new Date(Date.now() + 180 * 1000); // 3 mins remaining

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: cashierId,
            tenant_id: tenantId,
            username: 'cashier1',
            pin_hash: 'dummy',
            pin_salt: 'dummy',
            pin_failed_attempts: 5,
            pin_locked_until: futureLock,
            is_active: true,
            default_branch_id: branchId,
          },
        ],
      });

      try {
        await authService.pinLogin({
          userId: cashierId,
          pin: '2580',
          terminalCode,
        });
        expect.fail('Should have been rejected due to lockout');
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const body = err.getResponse();
        expect(body.error).toBe('PIN Locked');
        expect(body.remainingSeconds).toBeGreaterThan(0);
      }
    });
  });

  describe('3. Terminal Registration & Pairing', () => {
    it('pairs a terminal with manager authorization and generates device token', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: branchId, tenant_id: tenantId }],
      });

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'term-uuid-1',
            code: terminalCode,
            name: 'Express Lane 1',
            branch_id: branchId,
            auto_lock_minutes: 5,
          },
        ],
      });

      const pairRes = await authService.pairTerminal(
        {
          terminalCode,
          terminalName: 'Express Lane 1',
          branchId,
          autoLockMinutes: 5,
        },
        managerId,
      );

      expect(pairRes.terminalCode).toBe(terminalCode);
      expect(pairRes.terminalName).toBe('Express Lane 1');
      expect(pairRes.deviceToken).toBeDefined();
      expect(pairRes.deviceToken.length).toBe(64); // 32 bytes hex
      expect(pairRes.autoLockMinutes).toBe(5);
    });
  });

  describe('4. Manager PIN Override for Privileged POS Actions', () => {
    it('authorizes privileged discount or void action with valid manager PIN', async () => {
      const salt = pinHasher.generateSalt();
      const hash = await pinHasher.hashPin('8877', salt);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: managerId,
            username: 'store_manager',
            full_name: 'Store Manager (Supervisor)',
            tenant_id: tenantId,
            pin_hash: hash,
            pin_salt: salt,
            role_name: 'BRANCH_MANAGER',
            permissions: ['pos:sale:discount', 'pos:sale:refund'],
          },
        ],
      });

      const res = await authService.managerOverride({
        managerPin: '8877',
        action: 'DISCOUNT_OVERRIDE',
        requiredPermission: 'pos:sale:discount',
        amount: 25.0,
        notes: 'VIP customer courteous discount',
        branchId,
        cashierId,
      });

      expect(res.authorized).toBe(true);
      expect(res.supervisorId).toBe(managerId);
      expect(res.supervisorRole).toBe('BRANCH_MANAGER');
      expect(res.supervisorName).toBe('Store Manager (Supervisor)');
    });

    it('rejects override with invalid manager PIN', async () => {
      const salt = pinHasher.generateSalt();
      const hash = await pinHasher.hashPin('8877', salt);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: managerId,
            username: 'store_manager',
            full_name: 'Store Manager',
            tenant_id: tenantId,
            pin_hash: hash,
            pin_salt: salt,
            role_name: 'BRANCH_MANAGER',
            permissions: ['pos:sale:discount'],
          },
        ],
      });

      await expect(
        authService.managerOverride({
          managerPin: '0000',
          action: 'REFUND_OVERRIDE',
          branchId,
          cashierId,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
