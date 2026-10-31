import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../src/common/database/database.service';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { BranchActivationService } from '../../src/modules/branch-activation/branch-activation.service';
import { UsersService } from '../../src/modules/users/users.service';
import { SystemService } from '../../src/modules/system/system.service';
import { PosService } from '../../src/modules/pos/pos.service';
import { InventoryService } from '../../src/modules/inventory/inventory.service';
import { PlatformAdminService } from '../../src/modules/platform-admin/platform-admin.service';
import { generateUuidV7 } from '@gebeyaos/shared-types';

describe('Licensing Limits & Offline Grace Period (Step 5)', () => {
  let db: DatabaseService;
  let tenantContextService: TenantContextService;
  let activationService: BranchActivationService;
  let usersService: UsersService;
  let systemService: SystemService;
  let posService: PosService;
  let inventoryService: InventoryService;
  let platformService: PlatformAdminService;

  let testTenantId: string;
  let testBranchId: string;
  let testUserId: string;
  let adminId: string;

  beforeAll(async () => {
    process.env.DB_NAME = 'gebeyaos_test';
    tenantContextService = new TenantContextService();
    db = new DatabaseService(tenantContextService);
    db.onModuleInit();

    activationService = new BranchActivationService(db);
    usersService = new UsersService(db, tenantContextService);
    systemService = new SystemService(db);
    inventoryService = new InventoryService(db);
    posService = new PosService(db, inventoryService);
    platformService = new PlatformAdminService(db);

    const adminLogin = await platformService.login({
      username: 'platform_admin',
      password: 'PlatformAdmin2026!',
    });
    adminId = adminLogin.admin.id;

    // Create a constrained tenant: 1 branch max, 2 terminals max, 2 users max
    testTenantId = generateUuidV7();
    testBranchId = generateUuidV7();
    testUserId = generateUuidV7();

    await db.query(
      `INSERT INTO tenants (id, name, slug, status, plan, max_branches, max_terminals, max_users, grace_period_days)
       VALUES ($1, 'Constrained Mart', $2, 'active', 'starter', 1, 2, 2, 14)`,
      [testTenantId, `constrained-${Date.now()}`],
    );

    // Initial branch
    await db.query(
      `INSERT INTO branches (id, tenant_id, code, name, trade_name, tin_number, phone, is_hq)
       VALUES ($1, $2, 'CON-01', 'Constrained Branch 1', 'Constrained', '0011223344', '011223344', TRUE)`,
      [testBranchId, testTenantId],
    );

    // Initial terminal
    await db.query(
      `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type, is_active)
       VALUES ($1, $2, $3, 'POS-01', 'Lane 1', 'POS_STATION', TRUE)`,
      [generateUuidV7(), testTenantId, testBranchId],
    );

    // Owner role for tenant
    const roleId = generateUuidV7();
    await db.query(
      `INSERT INTO roles (id, tenant_id, name, description, is_system, max_discount_percentage)
       VALUES ($1, $2, 'CASHIER', 'Cashier', TRUE, 10)`,
      [roleId, testTenantId],
    );

    // Initial user (user 1 of 2)
    await db.query(
      `INSERT INTO users (id, tenant_id, username, full_name, phone, password_hash, pin_hash, role_id, default_branch_id, is_active)
       VALUES ($1, $2, $3, 'Cashier One', '0911000001', 'hash', 'pin', $4, $5, TRUE)`,
      [testUserId, testTenantId, `cashier1_${Date.now()}`, roleId, testBranchId],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.onModuleDestroy();
    }
  });

  describe('1. Plan Branch Quota Enforcement (max_branches = 1)', () => {
    it('blocks generating activation code or registering 2nd branch when limit reached', async () => {
      await expect(
        activationService.generateCode(
          {
            branchName: 'Illegal 2nd Branch',
          },
          'some-user-id',
          testTenantId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Plan Terminal Quota Enforcement (max_terminals = 2)', () => {
    it('allows registering up to quota then blocks exceeding terminal limit', async () => {
      await tenantContextService.runWithContext({ tenantId: testTenantId }, async () => {
        // Register terminal 2 of 2 -> Should succeed
        const term2 = await systemService.createTerminal({
          code: 'POS-02',
          name: 'Lane 2',
          branchId: testBranchId,
        });
        expect(term2.id).toBeDefined();

        // Register terminal 3 of 2 -> Must fail with ForbiddenException
        await expect(
          systemService.createTerminal({
            code: 'POS-03',
            name: 'Lane 3',
            branchId: testBranchId,
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('3. Plan User Quota Enforcement (max_users = 2)', () => {
    it('allows creating user up to quota then blocks exceeding user limit', async () => {
      await tenantContextService.runWithContext({ tenantId: testTenantId }, async () => {
        // User 2 of 2 -> Should succeed
        const user2 = await usersService.createUser(testUserId, {
          username: `cashier2_${Date.now()}`,
          fullName: 'Cashier Two',
          phone: `091100${Date.now().toString().slice(-4)}`,
          role: 'CASHIER',
          initialPassword: 'Password123!',
          pin: '1234',
          branchId: testBranchId,
        });
        expect(user2.id).toBeDefined();

        // User 3 of 2 -> Must fail with ForbiddenException
        await expect(
          usersService.createUser(testUserId, {
            username: `cashier3_${Date.now()}`,
            fullName: 'Cashier Three',
            phone: `091199${Date.now().toString().slice(-4)}`,
            role: 'CASHIER',
            initialPassword: 'Password123!',
            pin: '1234',
            branchId: testBranchId,
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('4. Suspended Tenant Offline Grace Period (14 Days)', () => {
    it('permits selling with calm notice during active offline grace period (e.g. Day 2 of 14)', async () => {
      // Suspend tenant 2 days ago
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
      await db.query(
        `UPDATE tenants SET status = 'suspended', suspended_at = $1 WHERE id = $2`,
        [twoDaysAgo, testTenantId],
      );

      await tenantContextService.runWithContext({ tenantId: testTenantId }, async () => {
        const license = await posService.verifyTenantLicense();
        expect(license.notice).toBeDefined();
        expect(license.notice).toContain('Offline grace period active: 12 day(s) remaining');
      });
    });

    it('strictly blocks POS sales once offline grace period has expired (> 14 days)', async () => {
      // Suspend tenant 15 days ago (> 14 days grace period)
      const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000);
      await db.query(
        `UPDATE tenants SET status = 'suspended', suspended_at = $1 WHERE id = $2`,
        [fifteenDaysAgo, testTenantId],
      );

      await tenantContextService.runWithContext({ tenantId: testTenantId }, async () => {
        await expect(posService.verifyTenantLicense()).rejects.toThrow(ForbiddenException);
      });
    });

    it('immediately restores full POS operations upon tenant reactivation', async () => {
      // Reactivate tenant
      await platformService.updateTenantStatus(testTenantId, 'active', adminId);

      await tenantContextService.runWithContext({ tenantId: testTenantId }, async () => {
        const license = await posService.verifyTenantLicense();
        expect(license.notice).toBeUndefined();
      });
    });
  });
});
