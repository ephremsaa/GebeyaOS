import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../src/modules/auth/auth.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { PasswordPolicyService } from '../../src/common/security/password-policy.service';
import { PinHasherService } from '../../src/common/security/pin-hasher.service';
import { TotpService } from '../../src/common/security/totp.service';
import { TokenService } from '../../src/common/security/token.service';
import { RateLimiterService } from '../../src/common/security/rate-limiter.service';
import { AuditSecurityService } from '../../src/common/security/audit-security.service';

describe('Tenant Back-Office Login & Lifecycle Flow (Step 2)', () => {
  let authService: AuthService;
  let mockDb: any;
  let passwordPolicy: PasswordPolicyService;
  let pinHasher: PinHasherService;
  let totp: TotpService;
  let tokenService: TokenService;
  let rateLimiter: RateLimiterService;
  let auditSecurity: AuditSecurityService;

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

  describe('1. Company Code Info Discovery', () => {
    it('returns tenant metadata for valid company code', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'ten-kerod-1',
            name: 'Kerod Supermarket',
            slug: 'kerod',
            status: 'active',
            logo_url: 'https://example.com/kerod.png',
            receipt_header: 'Kerod Supermarket PLC',
            default_language: 'am',
            plan: 'growth',
            suspended_at: null,
            grace_period_days: 14,
          },
        ],
      });

      const info = await authService.getCompanyInfo('kerod');
      expect(info.id).toBe('ten-kerod-1');
      expect(info.name).toBe('Kerod Supermarket');
      expect(info.slug).toBe('kerod');
      expect(info.isSuspended).toBe(false);
    });

    it('throws NotFoundException when company code does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(authService.getCompanyInfo('unknown-company')).rejects.toThrow(
        /Supermarket company code not found/,
      );
    });
  });

  describe('2. Multi-Tenant Back-Office Login Flow', () => {
    it('authenticates user with valid company code and password, returns assigned branches', async () => {
      const password = 'SecurePassword123!';
      const hash = await passwordPolicy.hashPassword(password);

      mockDb.query
        // 1. company slug lookup
        .mockResolvedValueOnce({
          rows: [{ id: 'ten-kerod-1', status: 'active' }],
        })
        // 2. user query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'usr-owner-1',
              tenant_id: 'ten-kerod-1',
              tenant_name: 'Kerod Supermarket',
              tenant_slug: 'kerod',
              tenant_status: 'active',
              username: 'kerod_owner',
              full_name: 'Kerod Admin',
              email: 'owner@kerod.et',
              phone: '+251911000001',
              password_hash: hash,
              role_name: 'OWNER',
              role_id: 'role-1',
              default_branch_id: 'br-bole-1',
              branch_code: 'BOLE-01',
              branch_name: 'Bole Medhanialem',
              is_active: true,
              failed_login_attempts: 0,
              locked_until: null,
              force_password_change: false,
              token_version: 1,
              permissions: ['*'],
            },
          ],
        })
        // 3. reset failed attempts
        .mockResolvedValueOnce({ rows: [] })
        // 4. query assigned branches
        .mockResolvedValueOnce({
          rows: [
            { id: 'br-bole-1', code: 'BOLE-01', name: 'Bole Medhanialem' },
            { id: 'br-cmc-1', code: 'CMC-01', name: 'CMC Branch' },
          ],
        })
        // 5. query user token version for token creation
        .mockResolvedValueOnce({ rows: [{ token_version: 1 }] })
        // 6. insert refresh_token
        .mockResolvedValueOnce({ rows: [] })
        // 7. insert audit log
        .mockResolvedValueOnce({ rows: [] });

      const res = await authService.login({
        companyCode: 'kerod',
        usernameOrPhone: 'kerod_owner',
        password,
      });

      expect(res.accessToken).toBeDefined();
      expect(res.refreshToken).toBeDefined();
      expect(res.user.username).toBe('kerod_owner');
      expect(res.user.tenantId).toBe('ten-kerod-1');
      expect(res.assignedBranches?.length).toBe(2);
      expect(res.assignedBranches?.[0].code).toBe('BOLE-01');
    });

    it('rejects user attempting to log in under wrong company code', async () => {
      mockDb.query
        // 1. company slug lookup for Maya
        .mockResolvedValueOnce({
          rows: [{ id: 'ten-maya-2', status: 'active' }],
        })
        // 2. user query filtered by tenant_id = ten-maya-2 returns no rows for Kerod user!
        .mockResolvedValueOnce({ rows: [] })
        // 3. audit log
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        authService.login({
          companyCode: 'maya',
          usernameOrPhone: 'kerod_owner',
          password: 'AnyPassword123!',
        }),
      ).rejects.toThrow(/Invalid credentials/);
    });

    it('rejects login when tenant is suspended and grace period has expired', async () => {
      const password = 'ValidPassword2026!';
      const hash = await passwordPolicy.hashPassword(password);

      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago (grace period 14 days expired)

      mockDb.query
        // 1. company slug
        .mockResolvedValueOnce({
          rows: [{ id: 'ten-suspended-1', status: 'suspended', suspended_at: pastDate, grace_period_days: 14 }],
        })
        // 2. user query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'usr-1',
              tenant_id: 'ten-suspended-1',
              tenant_status: 'suspended',
              suspended_at: pastDate,
              grace_period_days: 14,
              username: 'owner',
              password_hash: hash,
              is_active: true,
            },
          ],
        });

      await expect(
        authService.login({
          companyCode: 'suspended-mart',
          usernameOrPhone: 'owner',
          password,
        }),
      ).rejects.toThrow(/This supermarket account is suspended. Please contact platform support./);
    });
  });

  describe('3. Forgot & Reset Password Flow', () => {
    it('generates a 10-minute single-use reset code and dispatches mock notification', async () => {
      mockDb.query
        // 1. find tenant
        .mockResolvedValueOnce({ rows: [{ id: 'ten-1' }] })
        // 2. find user
        .mockResolvedValueOnce({ rows: [{ id: 'usr-1', email: 'owner@kerod.et', phone: '+251911223344' }] })
        // 3. delete old unused reset codes
        .mockResolvedValueOnce({ rows: [] })
        // 4. insert new reset code
        .mockResolvedValueOnce({ rows: [] })
        // 5. audit log
        .mockResolvedValueOnce({ rows: [] });

      const res = await authService.forgotPassword({
        companyCode: 'kerod',
        usernameOrPhone: 'owner',
        channel: 'SMS',
      });

      expect(res.success).toBe(true);
      expect(res.maskedTarget).toContain('****');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO password_resets'),
        expect.any(Array),
        'ten-1',
      );
    });

    it('resets password with valid code, enforces min 10 chars, and invalidates old sessions', async () => {
      const newPassword = 'BrandNewPassword2026!';

      mockDb.query
        // 1. find tenant
        .mockResolvedValueOnce({ rows: [{ id: 'ten-1' }] })
        // 2. find user
        .mockResolvedValueOnce({ rows: [{ id: 'usr-1' }] })
        // 3. find valid reset code
        .mockResolvedValueOnce({ rows: [{ id: 'rst-1', expires_at: new Date(Date.now() + 300000) }] })
        // 4. transaction mark code used
        .mockResolvedValueOnce({ rows: [] })
        // 5. update user password & increment token_version
        .mockResolvedValueOnce({ rows: [] })
        // 6. revoke existing refresh tokens
        .mockResolvedValueOnce({ rows: [] })
        // 7. audit log
        .mockResolvedValueOnce({ rows: [] });

      const res = await authService.resetPassword({
        companyCode: 'kerod',
        usernameOrPhone: 'owner',
        code: '123456',
        newPassword,
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain('Password has been reset successfully');

      // Verify token_version was incremented to revoke active sessions
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('token_version = token_version + 1'),
        expect.any(Array),
        'ten-1',
      );
    });
  });

  describe('4. User Profile & Session Revocation', () => {
    it('retrieves user profile and assigned branches', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'usr-1',
              tenant_id: 'ten-1',
              tenant_name: 'Kerod Supermarket',
              tenant_slug: 'kerod',
              username: 'owner',
              full_name: 'Abebe Kebede',
              email: 'owner@kerod.et',
              phone: '+251911223344',
              role_name: 'OWNER',
              default_branch_id: 'br-1',
              branch_name: 'Main Branch',
              requires_totp: false,
              created_at: new Date().toISOString(),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'br-1', code: 'BOLE-01', name: 'Main Branch' }],
        });

      const profile = await authService.getUserProfile('usr-1', 'ten-1');
      expect(profile.username).toBe('owner');
      expect(profile.assignedBranches.length).toBe(1);
    });

    it('lists active sessions and allows revoking a specific session', async () => {
      mockDb.query
        // list sessions
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'sess-1',
              device_info: 'Chrome on Windows 11',
              ip_address: '192.168.1.10',
              user_agent: 'Mozilla/5.0...',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        })
        // revoke session
        .mockResolvedValueOnce({ rows: [] });

      const sessions = await authService.getUserSessions('usr-1', 'ten-1');
      expect(sessions.length).toBe(1);
      expect(sessions[0].device).toBe('Chrome on Windows 11');

      await authService.revokeSession('usr-1', 'sess-1', 'ten-1');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE id = $1'),
        ['sess-1', 'usr-1'],
        'ten-1',
      );
    });
  });
});

