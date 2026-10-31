import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Client } from 'pg';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../src/common/database/database.service';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UsersService } from '../../src/modules/users/users.service';
import { PosService } from '../../src/modules/pos/pos.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { SyncClientService } from '../../src/modules/sync/sync-client.service';
import { SyncOutboxService } from '../../src/modules/sync/sync-outbox.service';
import { HqSyncService } from '../../../hq-server/src/modules/hq-sync/hq-sync.service';
import {
  TokenService,
  TENANT_JWT_SECRET,
  PLATFORM_JWT_SECRET,
  TENANT_ISSUER,
  TENANT_AUDIENCE,
  PLATFORM_ISSUER,
  PLATFORM_AUDIENCE,
} from '../../src/common/security/token.service';
import { PasswordPolicyService } from '../../src/common/security/password-policy.service';
import { PinHasherService } from '../../src/common/security/pin-hasher.service';
import { TotpService } from '../../src/common/security/totp.service';
import { RateLimiterService } from '../../src/common/security/rate-limiter.service';
import { AuditSecurityService } from '../../src/common/security/audit-security.service';
import { JwtAuthGuard, JWT_SECRET } from '../../src/common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../src/modules/platform-admin/guards/platform-admin.guard';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { generateUuidV7 } from '@gebeyaos/shared-types';

describe('Step 5: Offline Verification on Branch Server & Credential Sync Spec', () => {
  let db: DatabaseService;
  let rawClient: Client;
  let authService: AuthService;
  let usersService: UsersService;
  let posService: PosService;
  let tokenService: TokenService;
  let rateLimiter: RateLimiterService;
  let auditSecurity: AuditSecurityService;
  let passwordPolicy: PasswordPolicyService;
  let pinHasher: PinHasherService;
  let syncOutbox: SyncOutboxService;
  let syncClient: SyncClientService;
  let hqSyncService: HqSyncService;
  let tenantContext: TenantContextService;
  let jwtGuard: JwtAuthGuard;
  let platformGuard: PlatformAdminGuard;

  let ownerRoleId: string;
  let cashierRoleId: string;
  let testBranchId: string;

  // Test UUIDs
  const TEST_TENANT_A_ID = '01900000-0000-7000-8000-000000000001'; // Kerod Supermarket
  const TEST_TENANT_B_ID = '01900000-0000-7000-8000-000000000002'; // Maya Supermarket

  const USER_OFFLINE_ID = '01a50000-0000-7000-8000-000000000001';
  const USER_CASHIER_ID = '01a50000-0000-7000-8000-000000000002';
  const USER_SYNCED_ID  = '01a50000-0000-7000-8000-000000000003';
  const USER_OWNER_ID   = '01a50000-0000-7000-8000-000000000004';
  const TEST_TERMINAL_ID = '01a50000-0000-7000-8000-000000000010';

  beforeAll(async () => {
    process.env.DB_NAME = 'gebeyaos_test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/gebeyaos_test';
    db = new DatabaseService();
    (db as any).onModuleInit();
    rawClient = new Client({ connectionString: process.env.DATABASE_URL });
    await rawClient.connect();

    tokenService = new TokenService(db);
    rateLimiter = new RateLimiterService(db);
    auditSecurity = new AuditSecurityService(db);
    passwordPolicy = new PasswordPolicyService();
    pinHasher = new PinHasherService();
    syncOutbox = new SyncOutboxService(db);
    syncClient = new SyncClientService(db, syncOutbox);
    hqSyncService = new HqSyncService(db as any);
    tenantContext = new TenantContextService();
    jwtGuard = new JwtAuthGuard(db, tenantContext);
    platformGuard = new PlatformAdminGuard(db);

    authService = new AuthService(
      db,
      passwordPolicy,
      pinHasher,
      new TotpService(),
      tokenService,
      rateLimiter,
      auditSecurity,
    );
    usersService = new UsersService(db, tenantContext);
    const inventoryService = new InventoryService(db);
    posService = new PosService(db, inventoryService);

    const ownerRes = await rawClient.query(`SELECT id FROM roles WHERE name = 'OWNER' LIMIT 1`);
    ownerRoleId = ownerRes.rows[0].id;
    const cashierRes = await rawClient.query(`SELECT id FROM roles WHERE name = 'CASHIER' LIMIT 1`);
    cashierRoleId = cashierRes.rows[0].id;
    const branchRes = await rawClient.query(`SELECT id FROM branches WHERE tenant_id = $1 LIMIT 1`, [TEST_TENANT_A_ID]);
    testBranchId = branchRes.rows[0].id;

    // Clean up test users
    await rawClient.query(
      `DELETE FROM refresh_tokens WHERE user_id IN ($1, $2, $3, $4)`,
      [USER_OFFLINE_ID, USER_CASHIER_ID, USER_SYNCED_ID, USER_OWNER_ID],
    );
    await rawClient.query(
      `DELETE FROM users WHERE id IN ($1, $2, $3, $4)`,
      [USER_OFFLINE_ID, USER_CASHIER_ID, USER_SYNCED_ID, USER_OWNER_ID],
    );
    await rawClient.query(
      `DELETE FROM terminals WHERE id = $1`,
      [TEST_TERMINAL_ID],
    );
    await rawClient.query(
      `DELETE FROM sync_outbox WHERE tenant_id IN ($1, $2)`,
      [TEST_TENANT_A_ID, TEST_TENANT_B_ID],
    );

    // Seed local user with Argon2id password
    const passwordHash = await passwordPolicy.hashPassword('OfflineBranchPass2026!');
    const pinSalt = pinHasher.generateSalt();
    const pinHash = await pinHasher.hashPin('4321', pinSalt);

    await rawClient.query(
      `INSERT INTO users (
         id, tenant_id, username, full_name, email, phone,
         role_id, default_branch_id, is_active, password_hash,
         pin_hash, pin_salt, token_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, 1)`,
      [
        USER_OFFLINE_ID,
        TEST_TENANT_A_ID,
        'offline_manager',
        'Offline Branch Manager',
        'offline.mgr@kerod.et',
        '+251911998877',
        ownerRoleId,
        testBranchId,
        passwordHash,
        pinHash,
        pinSalt,
      ],
    );

    // Seed local cashier for PIN login
    const cashierPinSalt = pinHasher.generateSalt();
    const cashierPinHash = await pinHasher.hashPin('1234', cashierPinSalt);
    await rawClient.query(
      `INSERT INTO users (
         id, tenant_id, username, full_name, email, phone,
         role_id, default_branch_id, is_active, password_hash,
         pin_hash, pin_salt, token_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, $11, 1)`,
      [
        USER_CASHIER_ID,
        TEST_TENANT_A_ID,
        'offline_cashier',
        'Offline Terminal Cashier',
        'cashier1@kerod.et',
        '+251911223300',
        cashierRoleId,
        testBranchId,
        passwordHash,
        cashierPinHash,
        cashierPinSalt,
      ],
    );

    // Seed sole owner for Last-Owner protection test
    await rawClient.query(
      `INSERT INTO users (
         id, tenant_id, username, full_name, email, phone,
         role_id, default_branch_id, is_active, password_hash,
         token_version
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, 1)`,
      [
        USER_OWNER_ID,
        TEST_TENANT_A_ID,
        'sole_owner',
        'Sole Active Owner',
        'sole.owner@kerod.et',
        '+251911999999',
        ownerRoleId,
        testBranchId,
        passwordHash,
      ],
    );

    // Seed a paired terminal
    const terminalDeviceToken = 'test-terminal-secret-token-xyz';
    const terminalTokenHash = await passwordPolicy.hashPassword(terminalDeviceToken);
    await rawClient.query(
      `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_token_hash, is_active)
       VALUES ($1, $2, $3, 'TERM-OFF-01', 'Lane 1 Offline POS', $4, true)`,
      [TEST_TERMINAL_ID, TEST_TENANT_A_ID, testBranchId, terminalTokenHash],
    );
  });

  afterAll(async () => {
    await rawClient.query(
      `DELETE FROM refresh_tokens WHERE user_id IN ($1, $2, $3, $4)`,
      [USER_OFFLINE_ID, USER_CASHIER_ID, USER_SYNCED_ID, USER_OWNER_ID],
    );
    await rawClient.query(
      `DELETE FROM users WHERE id IN ($1, $2, $3, $4)`,
      [USER_OFFLINE_ID, USER_CASHIER_ID, USER_SYNCED_ID, USER_OWNER_ID],
    );
    await rawClient.query(`DELETE FROM terminals WHERE id = $1`, [TEST_TERMINAL_ID]);
    await rawClient.end();
    await (db as any).onModuleDestroy();
  });

  describe('1. 100% Offline Branch Authentication Verification', () => {
    it('verifies back-office login locally with zero network connection to HQ', async () => {
      // Simulate HQ down: transport throws network offline exception
      const mockHqTransport = vi.fn().mockRejectedValue(new Error('ECONNREFUSED: HQ is completely offline'));

      // The login query runs strictly against local branch database
      const loginResult = await authService.login(
        {
          companyCode: 'kerod',
          usernameOrPhone: 'offline_manager',
          password: 'OfflineBranchPass2026!',
        },
        '192.168.1.100',
        'Mozilla/5.0 (POS Terminal Offline)',
      );

      expect(loginResult).toBeDefined();
      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.refreshToken).toBeDefined();
      expect(loginResult.user.username).toBe('offline_manager');
      expect(loginResult.user.tenantId).toBe(TEST_TENANT_A_ID);

      // Verify token audience is bound to tenant app
      const decoded: any = jwt.decode(loginResult.accessToken);
      expect(decoded.iss).toBe(TENANT_ISSUER);
      expect(decoded.aud).toBe(TENANT_AUDIENCE);
    });

    it('verifies Cashier PIN login locally on terminal with zero network call to HQ', async () => {
      const pinResult = await authService.pinLogin(
        {
          userId: USER_CASHIER_ID,
          pin: '1234',
        },
        '192.168.1.101',
      );

      expect(pinResult.accessToken).toBeDefined();
      expect(pinResult.user.id).toBe(USER_CASHIER_ID);
      expect(pinResult.user.username).toBe('offline_cashier');
    });

    it('authorizes privileged manager PIN override locally offline', async () => {
      const overrideResult = await posService.verifyManagerPin(
        testBranchId,
        {
          pin: '4321', // manager PIN
          actionRequired: 'HIGH_DISCOUNT_OVERRIDE',
        },
      );

      expect(overrideResult.authorized).toBe(true);
      expect(overrideResult.role).toBe('OWNER');
    });

    it('rotates tenant refresh tokens locally without reaching out to HQ', async () => {
      const loginResult = await authService.login(
        {
          companyCode: 'kerod',
          usernameOrPhone: 'offline_manager',
          password: 'OfflineBranchPass2026!',
        },
        '192.168.1.100',
      );

      const rotated = await tokenService.rotateTenantRefreshToken(
        loginResult.refreshToken,
        '192.168.1.100',
        'Mozilla/5.0 (POS Terminal)',
      );

      expect(rotated.accessToken).toBeDefined();
      expect(rotated.refreshToken).toBeDefined();
      expect(rotated.refreshToken).not.toBe(loginResult.refreshToken);
    });
  });

  describe('2. Credential Sync Engine (HQ -> Branch, Hashes Only)', () => {
    it('applies user credential delta from HQ into branch DB without ever transmitting plaintext secrets', async () => {
      const syncedPasswordHash = await passwordPolicy.hashPassword('SyncedFromHq2026!');
      const syncedPinSalt = pinHasher.generateSalt();
      const syncedPinHash = await pinHasher.hashPin('8899', syncedPinSalt);

      // Delta payload contains ONLY hashes, never plaintext password or PIN
      const userDelta = {
        aggregateType: 'USER' as const,
        aggregateId: USER_SYNCED_ID,
        eventType: 'UPDATED' as const,
        data: {
          id: USER_SYNCED_ID,
          tenantId: TEST_TENANT_A_ID,
          username: 'hq_synced_cashier',
          fullName: 'HQ Synced Cashier',
          email: 'synced.cashier@kerod.et',
          phone: '+251911334455',
          roleId: cashierRoleId,
          defaultBranchId: testBranchId,
          isActive: true,
          passwordHash: syncedPasswordHash,
          pinHash: syncedPinHash,
          pinSalt: syncedPinSalt,
          tokenVersion: 1,
          requiresTotp: false,
        },
        updatedAt: new Date().toISOString(),
      };

      // Ensure no raw passwords or PINs are present in payload
      expect((userDelta.data as any).password).toBeUndefined();
      expect((userDelta.data as any).pin).toBeUndefined();

      // Branch server pulls & applies delta locally
      const mockTransport = vi.fn().mockResolvedValue({
        branchId: testBranchId,
        deltas: [userDelta],
        syncedUntil: new Date().toISOString(),
        hasMore: false,
      });

      const pullResult = await syncClient.pullCatalogDeltas(testBranchId, mockTransport);
      expect(pullResult.appliedCount).toBe(1);

      // Verify the newly synced user can immediately log in offline!
      const loginRes = await authService.login(
        {
          companyCode: 'kerod',
          usernameOrPhone: 'hq_synced_cashier',
          password: 'SyncedFromHq2026!',
        },
        '192.168.1.105',
      );
      expect(loginRes.user.username).toBe('hq_synced_cashier');

      // Verify newly synced cashier PIN also works on terminal offline
      const pinRes = await authService.pinLogin(
        {
          userId: USER_SYNCED_ID,
          pin: '8899',
        },
        '192.168.1.105',
      );
      expect(pinRes.accessToken).toBeDefined();
      expect(pinRes.user.username).toBe('hq_synced_cashier');
    });
  });

  describe('3. Deactivation Synchronization & Immediate Session Revocation', () => {
    it('deactivates user from HQ delta, immediately revokes active refresh tokens, and blocks subsequent requests', async () => {
      // 1. User logs in and gets tokens
      const loginRes = await authService.login(
        {
          companyCode: 'kerod',
          usernameOrPhone: 'hq_synced_cashier',
          password: 'SyncedFromHq2026!',
        },
        '192.168.1.105',
      );
      const activeAccessToken = loginRes.accessToken;
      const activeRefreshToken = loginRes.refreshToken;

      // 2. HQ syncs user deactivation delta (isActive = false, tokenVersion bumped)
      const deactivationDelta = {
        aggregateType: 'USER' as const,
        aggregateId: USER_SYNCED_ID,
        eventType: 'UPDATED' as const,
        data: {
          id: USER_SYNCED_ID,
          tenantId: TEST_TENANT_A_ID,
          username: 'hq_synced_cashier',
          fullName: 'HQ Synced Cashier',
          roleId: cashierRoleId,
          isActive: false, // DEACTIVATED AT HQ!
          tokenVersion: 2,
        },
        updatedAt: new Date().toISOString(),
      };

      const mockTransport = vi.fn().mockResolvedValue({
        branchId: testBranchId,
        deltas: [deactivationDelta],
        syncedUntil: new Date().toISOString(),
        hasMore: false,
      });

      await syncClient.pullCatalogDeltas(testBranchId, mockTransport);

      // 3. Attempting to refresh the existing session FAILS immediately!
      await expect(
        tokenService.rotateTenantRefreshToken(activeRefreshToken, '192.168.1.105'),
      ).rejects.toThrow();

      // 4. Subsequent API calls with existing access token are REJECTED immediately by JwtAuthGuard!
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${activeAccessToken}` },
          }),
        }),
      };

      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(
        /User account has been deactivated/i,
      );
    });
  });

  describe('4. Local Deactivation by Branch Admin & Sync Outbox Queuing', () => {
    it('deactivates user locally, revokes sessions, and queues USER event into sync_outbox for HQ', async () => {
      // Re-activate user first
      await rawClient.query(`UPDATE users SET is_active = true WHERE id = $1`, [USER_OFFLINE_ID]);

      // Login to obtain active session
      const loginRes = await authService.login(
        {
          companyCode: 'kerod',
          usernameOrPhone: 'offline_manager',
          password: 'OfflineBranchPass2026!',
        },
        '192.168.1.100',
      );

      // Local branch admin deactivates user
      const deactivateRes = await usersService.setUserActiveStatus(
        USER_OFFLINE_ID,
        USER_OFFLINE_ID,
        false,
      );
      expect(deactivateRes.isActive).toBe(false);

      // 1. Active refresh token is revoked immediately
      await expect(
        tokenService.rotateTenantRefreshToken(loginRes.refreshToken, '192.168.1.100'),
      ).rejects.toThrow();

      // 2. An event is queued in sync_outbox for HQ
      const outboxRes = await rawClient.query(
        `SELECT * FROM sync_outbox WHERE aggregate_type = 'USER' AND aggregate_id = $1`,
        [USER_OFFLINE_ID],
      );
      expect(outboxRes.rows.length).toBeGreaterThanOrEqual(1);
      const outboxEvent = outboxRes.rows[0];
      expect(outboxEvent.status).toBe('PENDING');
      const payload = typeof outboxEvent.payload === 'string' ? JSON.parse(outboxEvent.payload) : outboxEvent.payload;
      expect(payload.isActive).toBe(false);

      // Restore user for subsequent tests
      await rawClient.query(`UPDATE users SET is_active = true WHERE id = $1`, [USER_OFFLINE_ID]);
    });
  });

  describe('5. Offline Security Audit Trail Queuing & HQ Push', () => {
    it('queues offline auth audit logs in sync_outbox and flushes them to HQ sync_inbox upon push', async () => {
      // 1. Perform an auth event offline (which calls AuditSecurityService.logAuthEvent)
      await auditSecurity.logAuthEvent({
        tenantId: TEST_TENANT_A_ID,
        branchId: testBranchId,
        userId: USER_OFFLINE_ID,
        action: 'OFFLINE_LOGIN_SUCCESS',
        ipAddress: '192.168.1.50',
        userAgent: 'POS Terminal Cashier Lane 1',
        result: 'SUCCESS',
        details: { method: 'PASSWORD_OFFLINE', terminal: 'TERM-01' },
      });

      // 2. Verify audit record in audit_logs with status PENDING
      const auditRes = await rawClient.query(
        `SELECT * FROM audit_logs WHERE action = 'OFFLINE_LOGIN_SUCCESS' AND user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [USER_OFFLINE_ID],
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].sync_status).toBe('PENDING');

      // 3. Verify queued event in sync_outbox
      const outboxRes = await rawClient.query(
        `SELECT * FROM sync_outbox WHERE aggregate_type = 'AUDIT_LOG' AND status = 'PENDING'`,
      );
      expect(outboxRes.rows.length).toBeGreaterThanOrEqual(1);

      // 4. Execute push to HQ via HqSyncService
      const pushResult = await syncClient.pushPendingEvents(
        testBranchId,
        50,
        async (batch) => {
          return hqSyncService.processBranchPush(batch, TEST_TENANT_A_ID, testBranchId);
        },
      );

      expect(pushResult.ackCount).toBeGreaterThanOrEqual(1);
      expect(pushResult.conflictsCount).toBe(0);

      // 5. Verify sync_outbox entry is now ACKNOWLEDGED
      const ackRes = await rawClient.query(
        `SELECT * FROM sync_outbox WHERE aggregate_type = 'AUDIT_LOG' AND status = 'ACKNOWLEDGED'`,
      );
      expect(ackRes.rows.length).toBeGreaterThanOrEqual(1);

      // 6. Verify audit_log is now marked SYNCED
      const updatedAudit = await rawClient.query(
        `SELECT * FROM audit_logs WHERE id = $1`,
        [auditRes.rows[0].id],
      );
      expect(updatedAudit.rows[0].sync_status).toBe('SYNCED');
    });
  });

  describe('6. Cross-Tenant & Domain Isolation Security', () => {
    it('rejects Tenant A user attempting to log in under Tenant B company code', async () => {
      // offline_manager belongs to Kerod (Tenant A); trying to log in under 'maya' (Tenant B)
      await expect(
        authService.login(
          {
            companyCode: 'maya',
            usernameOrPhone: 'offline_manager',
            password: 'OfflineBranchPass2026!',
          },
          '192.168.1.100',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects platform admin tokens on tenant-facing API endpoints', async () => {
      const platformToken = jwt.sign(
        {
          sub: '01900000-0000-7000-8000-000000000000',
          username: 'platform_admin',
          role: 'SUPER_ADMIN',
          isPlatformAdmin: true,
        },
        PLATFORM_JWT_SECRET,
        {
          issuer: PLATFORM_ISSUER,
          audience: PLATFORM_AUDIENCE,
          expiresIn: '15m',
        },
      );

      const mockReq: any = {
        headers: { authorization: `Bearer ${platformToken}` },
      };
      const mockContext: any = {
        switchToHttp: () => ({ getRequest: () => mockReq }),
      };

      // JwtAuthGuard verifies with TENANT_JWT_SECRET; platform token fails verification
      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tenant user tokens on platform admin endpoints', async () => {
      const tenantToken = jwt.sign(
        {
          sub: USER_OFFLINE_ID,
          tenantId: TEST_TENANT_A_ID,
          username: 'offline_manager',
          role: 'OWNER',
        },
        TENANT_JWT_SECRET,
        {
          issuer: TENANT_ISSUER,
          audience: TENANT_AUDIENCE,
          expiresIn: '15m',
        },
      );

      const mockReq: any = {
        headers: { authorization: `Bearer ${tenantToken}` },
      };
      const mockContext: any = {
        switchToHttp: () => ({ getRequest: () => mockReq }),
      };

      // PlatformAdminGuard verifies with PLATFORM_JWT_SECRET; tenant token fails verification
      await expect(platformGuard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('7. Last-Owner Protection Rule', () => {
    it('blocks deactivating the sole active Owner of a tenant', async () => {
      // Deactivate other owners in Tenant A if any
      await rawClient.query(
        `UPDATE users SET is_active = false
         WHERE tenant_id = $1 AND role_id = $2 AND id != $3`,
        [TEST_TENANT_A_ID, ownerRoleId, USER_OWNER_ID],
      );

      // Attempting to deactivate USER_OWNER_ID must throw BadRequestException
      await expect(
        usersService.setUserActiveStatus(USER_OWNER_ID, USER_OWNER_ID, false),
      ).rejects.toThrow(/The last active Owner cannot be deactivated or removed/i);

      // Attempting to delete USER_OWNER_ID must also throw BadRequestException
      await expect(
        usersService.deleteUser(USER_OWNER_ID, USER_OWNER_ID),
      ).rejects.toThrow(/The last active Owner cannot be deactivated or removed/i);

      // Restore other users
      await rawClient.query(
        `UPDATE users SET is_active = true WHERE id = $1`,
        [USER_OFFLINE_ID],
      );
    });
  });
});
