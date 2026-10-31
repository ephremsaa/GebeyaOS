import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../../src/modules/auth/auth.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { SetupWizardDto, LoginDto, PinLoginDto } from '../../src/modules/auth/dto/auth.dto';
import * as argon2 from 'argon2';

describe('AuthService (Phase 1)', () => {
  let authService: AuthService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
    authService = new AuthService(mockDb as DatabaseService);
  });

  describe('Setup Wizard Flow', () => {
    it('reports setupCompleted: false when no users or settings exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // system_settings setup_completed
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // users count

      const status = await authService.getSetupStatus();
      expect(status.setupCompleted).toBe(false);
      expect(status.ownerExists).toBe(false);
    });

    it('reports setupCompleted: true when system settings or users exist', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ value: { completed: true } }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ code: 'BOLE-01', name: 'Gebeya Supermarket' }] });

      const status = await authService.getSetupStatus();
      expect(status.setupCompleted).toBe(true);
      expect(status.ownerExists).toBe(true);
      expect(status.storeName).toBe('Gebeya Supermarket');
    });

    it('executes setup wizard, creates owner with argon2 hash, and locks setup', async () => {
      // getSetupStatus returns false
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // system_settings check
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // users count
        // tenant check (exists)
        .mockResolvedValueOnce({ rows: [{ id: '01900000-0000-7000-8000-000000000001', slug: 'gebeya-market' }] })
        .mockResolvedValueOnce({ rows: [] }) // update tenants
        // fetch OWNER role (exists)
        .mockResolvedValueOnce({ rows: [{ id: 'role-owner-123' }] })
        // insert canonical roles
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        // insert branch
        .mockResolvedValueOnce({ rows: [{ id: 'branch-1' }] })
        // insert terminal
        .mockResolvedValueOnce({ rows: [] })
        // insert owner
        .mockResolvedValueOnce({ rows: [{ id: 'owner-1' }] })
        // insert branch assignment
        .mockResolvedValueOnce({ rows: [] })
        // insert system_settings lock
        .mockResolvedValueOnce({ rows: [] })
        // insert audit log
        .mockResolvedValueOnce({ rows: [] })
        // get role permissions
        .mockResolvedValueOnce({ rows: [{ permission_id: 'admin:users:manage' }] })
        // insert refresh_tokens
        .mockResolvedValueOnce({ rows: [] });

      const dto: SetupWizardDto = {
        companyName: 'Gebeya Market',
        branchCode: 'BOLE-01',
        branchName: 'Bole Medhanialem',
        tinNumber: '0012345678',
        currency: 'ETB',
        defaultVatRate: 0.15,
        language: 'en',
        ownerUsername: 'owner',
        ownerFullName: 'Abebe Kebede',
        ownerPhone: '+251911000000',
        ownerPassword: 'SecurePassword123!',
        ownerPin: '1234',
      };

      const result = await authService.executeSetup(dto, '192.168.1.10');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.username).toBe('owner');
      expect(result.user.role).toBe('OWNER');
    });

    it('auto-provisions tenant, OWNER role with permissions, and terminal on empty fresh install', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // system_settings check
        .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // users count
        // 1. tenant check: not found
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // slug check
        .mockResolvedValueOnce({ rows: [] }) // insert tenant
        // 2. roles check: OWNER not found
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // insert OWNER role
        .mockResolvedValueOnce({ rows: [{ id: 'perm-1' }, { id: 'perm-2' }] }) // select permissions
        .mockResolvedValueOnce({ rows: [] }) // insert role_permissions 1
        .mockResolvedValueOnce({ rows: [] }) // insert role_permissions 2
        // insert canonical roles
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        // 3. insert branch
        .mockResolvedValueOnce({ rows: [{ id: 'branch-fresh-1' }] })
        // 4. insert terminal
        .mockResolvedValueOnce({ rows: [] })
        // 5. insert owner
        .mockResolvedValueOnce({ rows: [{ id: 'owner-fresh-1' }] })
        .mockResolvedValueOnce({ rows: [] }) // insert branch assignment
        // 6. insert system_settings lock
        .mockResolvedValueOnce({ rows: [] })
        // get role permissions (inside transaction)
        .mockResolvedValueOnce({ rows: [{ permission_id: 'perm-1' }, { permission_id: 'perm-2' }] })
        // audit log & sync outbox (outside transaction)
        .mockResolvedValueOnce({ rows: [] }) // insert audit_logs
        .mockResolvedValueOnce({ rows: [] }) // insert sync_outbox
        // token service user verification
        .mockResolvedValueOnce({ rows: [{ token_version: 1, is_active: true }] })
        // insert refresh_tokens
        .mockResolvedValueOnce({ rows: [] });

      const dto: SetupWizardDto = {
        companyName: 'Sahle Supermarket',
        branchCode: 'MAIN-01',
        branchName: 'Main Store',
        tinNumber: '0098765432',
        currency: 'ETB',
        defaultVatRate: 0.15,
        language: 'en',
        ownerUsername: 'recodpos',
        ownerFullName: 'sahle leka',
        ownerPhone: '0911359269',
        ownerPassword: 'SecurePassword123!',
        ownerPin: '1234',
      };

      const result = await authService.executeSetup(dto, '127.0.0.1');
      expect(result.accessToken).toBeDefined();
      expect(result.user.username).toBe('recodpos');
      expect(result.user.fullName).toBe('sahle leka');
      expect(result.user.role).toBe('OWNER');
      expect(result.user.tenantSlug).toBe('sahle-supermarket');
      expect(result.user.permissions).toEqual(['perm-1', 'perm-2']);
    });

    it('permanently locks setup wizard after initial execution', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ value: { completed: true } }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ code: 'BOLE-01', name: 'Gebeya Supermarket' }] });

      const dto: SetupWizardDto = {
        companyName: 'Duplicate Store',
        branchCode: 'BOLE-02',
        branchName: 'Branch 2',
        tinNumber: '0098765432',
        currency: 'ETB',
        defaultVatRate: 0.15,
        language: 'en',
        ownerUsername: 'owner2',
        ownerFullName: 'Someone',
        ownerPhone: '+251922000000',
        ownerPassword: 'AnotherPassword123!',
        ownerPin: '9999',
      };

      await expect(authService.executeSetup(dto)).rejects.toThrow(
        /permanently locked/,
      );
    });
  });

  describe('Login & Lockout Flow', () => {
    it('authenticates user with valid argon2 password and returns JWT session', async () => {
      const password = 'CorrectPassword123!';
      const hash = await argon2.hash(password);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              username: 'manager1',
              full_name: 'Manager One',
              phone: '+251911223344',
              password_hash: hash,
              role_name: 'BRANCH_MANAGER',
              role_id: 'role-mgr',
              is_active: true,
              failed_login_attempts: 0,
              locked_until: null,
              force_password_change: false,
              permissions: ['pos:shift:open', 'reports:branch:view'],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // reset attempts
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // refresh token insert

      const res = await authService.login({
        usernameOrPhone: 'manager1',
        password,
      });

      expect(res.accessToken).toBeDefined();
      expect(res.user.role).toBe('BRANCH_MANAGER');
      expect(res.user.permissions).toContain('reports:branch:view');
    });

    it('increments failed attempts and provides remaining warning on bad password', async () => {
      const hash = await argon2.hash('RealPassword123!');

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              username: 'cashier1',
              password_hash: hash,
              is_active: true,
              failed_login_attempts: 2,
              locked_until: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // update failed_login_attempts
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await expect(
        authService.login({
          usernameOrPhone: 'cashier1',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(/2 attempt\(s\) remaining/);
    });

    it('locks account after 5 consecutive failed attempts', async () => {
      const hash = await argon2.hash('RealPassword123!');

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              username: 'cashier1',
              password_hash: hash,
              is_active: true,
              failed_login_attempts: 4,
              locked_until: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // update locked_until
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await expect(
        authService.login({
          usernameOrPhone: 'cashier1',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(/locked for 15 minutes/);
    });

    it('prevents login if account is currently locked out', async () => {
      const futureLock = new Date(Date.now() + 10 * 60 * 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            username: 'cashier1',
            password_hash: 'somehash',
            is_active: true,
            failed_login_attempts: 5,
            locked_until: futureLock.toISOString(),
          },
        ],
      });

      await expect(
        authService.login({
          usernameOrPhone: 'cashier1',
          password: 'AnyPassword',
        }),
      ).rejects.toThrow(/Account is temporarily locked/);
    });
  });

  describe('Fast Cashier PIN Login', () => {
    it('authenticates cashier by 4-6 digit PIN', async () => {
      const pin = '4826';
      const pinHash = await argon2.hash(pin);

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cashier-10',
              username: 'selam',
              full_name: 'Selamawit G.',
              pin_hash: pinHash,
              role_name: 'CASHIER',
              role_id: 'role-csh',
              is_active: true,
              permissions: ['pos:sale:create'],
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // refresh token insert

      const res = await authService.pinLogin({
        pin,
        terminalCode: 'POS-01',
      });

      expect(res.user.username).toBe('selam');
      expect(res.user.role).toBe('CASHIER');
      expect(res.accessToken).toBeDefined();
    });

    it('rejects invalid cashier PIN', async () => {
      const pinHash = await argon2.hash('1234');

      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'cashier-10',
              pin_hash: pinHash,
              is_active: true,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await expect(
        authService.pinLogin({
          pin: '9999',
          terminalCode: 'POS-01',
        }),
      ).rejects.toThrow(/Invalid cashier PIN/);
    });
  });
});
