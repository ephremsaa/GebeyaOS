import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from '../../src/modules/users/users.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { CreateStaffUserDto, CreateRoleDto } from '../../src/modules/users/dto/users.dto';

describe('UsersService (Phase 1)', () => {
  let usersService: UsersService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb: any) => cb(mockDb)),
    };
    usersService = new UsersService(mockDb as DatabaseService);
  });

  describe('Staff Creation (No Public Self-Registration)', () => {
    it('creates staff user with role, hashed PIN & password, and forces initial password change', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // check unique username/phone
        .mockResolvedValueOnce({ rows: [{ id: 'role-csh-1' }] }) // fetch role ID
        .mockResolvedValueOnce({ rows: [{ id: 'branch-1' }] }) // default branch
        .mockResolvedValueOnce({ rows: [] }) // insert user
        .mockResolvedValueOnce({ rows: [] }) // branch assignment
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const dto: CreateStaffUserDto = {
        username: 'solomon',
        fullName: 'Solomon Tilahun',
        phone: '+251912345678',
        role: 'CASHIER',
        initialPassword: 'TempPassword123!',
        pin: '5566',
        forcePasswordChange: true,
      };

      const res = await usersService.createUser('admin-id-1', dto);
      expect(res.username).toBe('solomon');
      expect(res.role).toBe('CASHIER');
      expect(res.forcePasswordChange).toBe(true);
      expect(res.isActive).toBe(true);
    });

    it('prevents creating duplicate username or phone', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }] });

      const dto: CreateStaffUserDto = {
        username: 'solomon',
        fullName: 'Solomon Tilahun',
        phone: '+251912345678',
        role: 'CASHIER',
        initialPassword: 'TempPassword123!',
        pin: '5566',
      };

      await expect(usersService.createUser('admin-id-1', dto)).rejects.toThrow(
        /already registered/,
      );
    });
  });

  describe('Session Termination & Active Toggle', () => {
    it('immediately revokes all active refresh tokens when user is deactivated', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'user-csh-1', is_active: true, role_name: 'CASHIER' }] }) // check user role
        .mockResolvedValueOnce({ rows: [] }) // update is_active = false
        .mockResolvedValueOnce({ rows: [] }) // revoke refresh_tokens
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.setUserActiveStatus('admin-id-1', 'user-csh-1', false);
      expect(res.isActive).toBe(false);

      // Verify the revocation query was called with user-csh-1
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
        ['user-csh-1'],
      );
    });
  });

  describe('Last-Owner Rule Protection', () => {
    it('prevents deactivating the last active Owner via setUserActiveStatus', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'owner-1', is_active: true, role_name: 'OWNER' }] }) // user check
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // only 1 active owner exists!

      await expect(
        usersService.setUserActiveStatus('admin-1', 'owner-1', false),
      ).rejects.toThrow(/The last active Owner cannot be deactivated or removed/);
    });

    it('prevents deactivating the last active Owner via updateUser', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'owner-1', role_id: 'r-owner', default_branch_id: 'b-1', is_active: true, role_name: 'OWNER' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // only 1 active owner exists!

      await expect(
        usersService.updateUser('admin-1', 'owner-1', { isActive: false }),
      ).rejects.toThrow(/The last active Owner cannot be deactivated or removed/);
    });

    it('prevents demoting the last active Owner to another role', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: 'owner-1', role_id: 'r-owner', default_branch_id: 'b-1', is_active: true, role_name: 'OWNER' }],
        })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // only 1 active owner exists!

      await expect(
        usersService.updateUser('admin-1', 'owner-1', { role: 'CASHIER' }),
      ).rejects.toThrow(/The last active Owner cannot be demoted/);
    });

    it('prevents deleting the last active Owner', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'owner-1', is_active: true, role_name: 'OWNER' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }); // only 1 active owner!

      await expect(
        usersService.deleteUser('admin-1', 'owner-1'),
      ).rejects.toThrow(/The last active Owner cannot be deactivated or removed/);
    });

    it('allows deactivating an Owner if another active Owner exists', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'owner-1', is_active: true, role_name: 'OWNER' }] })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // 2 active owners!
        .mockResolvedValueOnce({ rows: [] }) // update is_active = false
        .mockResolvedValueOnce({ rows: [] }) // revoke tokens
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.setUserActiveStatus('admin-1', 'owner-1', false);
      expect(res.isActive).toBe(false);
    });
  });

  describe('Admin Password & PIN Reset', () => {
    it('resets password, forces password change, and revokes old sessions', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // update user password & force_password_change
        .mockResolvedValueOnce({ rows: [] }) // revoke refresh_tokens
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.adminResetPassword('admin-id-1', 'user-target-1', {
        newPassword: 'NewAdminAssignedPass123!',
        forcePasswordChange: true,
      });

      expect(res.success).toBe(true);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
        ['user-target-1'],
      );
    });

    it('resets cashier quick PIN and writes audit trail', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // update pin_hash
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.adminResetPin('admin-id-1', 'user-csh-1', {
        newPin: '9876',
      });

      expect(res.success).toBe(true);
    });
  });

  describe('Custom Roles & Granular Permission Matrix', () => {
    it('creates custom role with granular permissions and audit logging', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // check unique role name
        .mockResolvedValueOnce({ rows: [] }) // insert role
        .mockResolvedValueOnce({ rows: [] }) // insert perm 1
        .mockResolvedValueOnce({ rows: [] }) // insert perm 2
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const dto: CreateRoleDto = {
        name: 'SHIFT_SUPERVISOR',
        description: 'Supervisor responsible for shift closes and overrides',
        permissions: ['pos:shift:close', 'catalog:cost:view'],
        maxDiscountPercentage: 15,
      };

      const res = await usersService.createRole('admin-1', dto);
      expect(res.name).toBe('SHIFT_SUPERVISOR');
      expect(res.isSystem).toBe(false);
      expect(res.permissions).toContain('pos:shift:close');
    });

    it('prevents creating duplicate role', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: 'existing-role' }] });

      await expect(
        usersService.createRole('admin-1', { name: 'CASHIER' }),
      ).rejects.toThrow(/already exists/);
    });

    it('updates role permissions and max discount limit', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: 'role-mgr-1', name: 'BRANCH_MANAGER' }] })
        .mockResolvedValueOnce({ rows: [] }) // delete existing permissions
        .mockResolvedValueOnce({ rows: [] }) // insert new perm 1
        .mockResolvedValueOnce({ rows: [] }) // update max discount
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.updateRolePermissions('admin-1', 'role-mgr-1', {
        permissionIds: ['pos:sale:discount', 'reports:branch:view'],
        maxDiscountPercentage: 30,
      });

      expect(res.success).toBe(true);
    });

    it('prevents deleting system roles', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'role-owner', name: 'OWNER', is_system: true }],
      });

      await expect(
        usersService.deleteRole('admin-1', 'role-owner'),
      ).rejects.toThrow(/System roles cannot be deleted/);
    });
  });
});
