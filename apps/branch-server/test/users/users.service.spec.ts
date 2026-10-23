import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from '../../src/modules/users/users.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { CreateStaffUserDto } from '../../src/modules/users/dto/users.dto';

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
        .mockResolvedValueOnce({ rows: [] }) // update is_active = false
        .mockResolvedValueOnce({ rows: [] }) // revoke refresh_tokens
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const res = await usersService.setUserActiveStatus('admin-id-1', 'user-to-disable', false);
      expect(res.isActive).toBe(false);

      // Verify the revocation query was called with user-to-disable
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
        ['user-to-disable'],
      );
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
  });
});
