import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { DatabaseService } from '../../common/database/database.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  CreateStaffUserDto,
  UpdateStaffUserDto,
  CreateRoleDto,
  AdminResetPasswordDto,
  AdminResetPinDto,
  UpdateRolePermissionsDto,
} from './dto/users.dto';
import { generateUuidV7 } from '@gebeyaos/shared-types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  /**
   * Helper: Hash with Argon2id
   */
  private async hash(val: string): Promise<string> {
    return argon2.hash(val, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
    });
  }

  /**
   * 1. List Staff Directory
   */
  async listUsers(branchId?: string) {
    let sql = `
      SELECT u.id, u.username, u.full_name, u.email, u.phone,
             u.role_id, r.name as role, r.description as role_description,
             u.default_branch_id, b.code as branch_code, b.name as branch_name,
             u.is_active, u.force_password_change, u.last_login_at,
             u.created_at,
             COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN branches b ON b.id = u.default_branch_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
    `;
    const params: any[] = [];
    if (branchId) {
      sql += ` WHERE u.default_branch_id = $1`;
      params.push(branchId);
    }
    sql += `
      GROUP BY u.id, u.username, u.full_name, u.email, u.phone,
               u.role_id, r.name, r.description, u.default_branch_id,
               b.code, b.name, u.is_active, u.force_password_change,
               u.last_login_at, u.created_at
      ORDER BY u.created_at DESC
    `;

    const res = await this.db.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      roleDescription: row.role_description,
      roleId: row.role_id,
      branchId: row.default_branch_id,
      branchCode: row.branch_code,
      branchName: row.branch_name,
      isActive: row.is_active,
      forcePasswordChange: row.force_password_change,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      permissions: row.permissions || [],
    }));
  }

  /**
   * 2. Create Staff Member (Restricted to Owner/Manager, NO public signup)
   */
  async createUser(creatorId: string, dto: CreateStaffUserDto) {
    // Enforce Plan Licensing Limit (max_users) when tenant context is active
    const activeTenantId = this.tenantContextService?.getTenantId();
    if (activeTenantId) {
      try {
        const quotaRes = await this.db.query(
          `SELECT t.max_users, COUNT(u.id)::int as current_users
           FROM tenants t
           LEFT JOIN users u ON u.tenant_id = t.id
           WHERE t.id = $1
           GROUP BY t.max_users`,
          [activeTenantId],
          activeTenantId,
        );
        if (quotaRes && quotaRes.rows && quotaRes.rows.length > 0) {
          const { max_users, current_users } = quotaRes.rows[0];
          if (current_users >= max_users) {
            throw new ForbiddenException(
              `Subscription plan user limit reached (${current_users}/${max_users}). Upgrade your supermarket plan in the Platform Console to add more staff users.`,
            );
          }
        }
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
      }
    }

    const existing = await this.db.query(
      `SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR phone = $2 LIMIT 1`,
      [dto.username.trim(), dto.phone.trim()],
    );
    if (existing && existing.rows && existing.rows.length > 0) {
      throw new ConflictException('Username or phone number is already registered.');
    }

    const roleRes = await this.db.query(
      `SELECT id FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [dto.role],
    );
    if (!roleRes || !roleRes.rows || roleRes.rows.length === 0) {
      throw new NotFoundException(`Role ${dto.role} does not exist.`);
    }
    const roleId = roleRes.rows[0].id;

    const passwordHash = await this.hash(dto.initialPassword);
    const pinHash = await this.hash(dto.pin);
    const userId = generateUuidV7();

    const branchId = dto.branchId || (await this.getDefaultBranchId());
    const tenantId = activeTenantId || '01900000-0000-7000-8000-000000000001';

    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, tenant_id, username, full_name, email, phone, password_hash, pin_hash, role_id, default_branch_id, is_active, force_password_change)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)`,
        [
          userId,
          tenantId,
          dto.username.toLowerCase().trim(),
          dto.fullName.trim(),
          dto.email?.trim() || null,
          dto.phone.trim(),
          passwordHash,
          pinHash,
          roleId,
          branchId,
          dto.forcePasswordChange ?? true,
        ],
      );

      if (branchId) {
        await client.query(
          `INSERT INTO user_branch_assignments (tenant_id, user_id, branch_id)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [tenantId, userId, branchId],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, branch_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, 'USER_CREATED', 'users', $5, $6)`,
        [
          generateUuidV7(),
          tenantId,
          branchId,
          creatorId,
          userId,
          JSON.stringify({
            username: dto.username,
            role: dto.role,
            fullName: dto.fullName,
          }),
        ],
      );
    });

    return {
      id: userId,
      username: dto.username.toLowerCase().trim(),
      fullName: dto.fullName.trim(),
      role: dto.role,
      branchId,
      isActive: true,
      forcePasswordChange: dto.forcePasswordChange ?? true,
    };
  }

  /**
   * 3. Update Staff Member (Enforces Last-Owner Rule)
   */
  async updateUser(adminId: string, userId: string, dto: UpdateStaffUserDto) {
    const userRes = await this.db.query(
      `SELECT u.id, u.role_id, u.default_branch_id, u.is_active, u.tenant_id, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('User not found.');
    const currentUser = userRes.rows[0];

    // LAST-OWNER RULE ENFORCEMENT
    const isDeactivating = dto.isActive === false;
    const isDemoting = !!dto.role && dto.role.toUpperCase() !== 'OWNER';
    if (currentUser.role_name === 'OWNER' && currentUser.is_active) {
      if (isDeactivating || isDemoting) {
        const ownersCountRes = await this.db.query(
          `SELECT count(*)::int as count
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE (u.tenant_id = $1 OR $1 IS NULL) AND r.name = 'OWNER' AND u.is_active = true`,
          [currentUser.tenant_id],
        );
        const activeOwnersCount = ownersCountRes.rows[0]?.count || 0;
        if (activeOwnersCount <= 1) {
          if (isDeactivating) {
            throw new BadRequestException('The last active Owner cannot be deactivated or removed.');
          }
          if (isDemoting) {
            throw new BadRequestException('The last active Owner cannot be demoted.');
          }
        }
      }
    }

    let newRoleId: string | undefined;
    if (dto.role) {
      const r = await this.db.query(`SELECT id FROM roles WHERE LOWER(name) = LOWER($1)`, [dto.role]);
      if (r.rows.length > 0) newRoleId = r.rows[0].id;
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET full_name = COALESCE($1, full_name),
             phone = COALESCE($2, phone),
             email = COALESCE($3, email),
             role_id = COALESCE($4, role_id),
             default_branch_id = COALESCE($5, default_branch_id),
             is_active = COALESCE($6, is_active),
             updated_at = clock_timestamp()
         WHERE id = $7`,
        [
          dto.fullName?.trim() || null,
          dto.phone?.trim() || null,
          dto.email?.trim() || null,
          newRoleId || null,
          dto.branchId || null,
          dto.isActive !== undefined ? dto.isActive : null,
          userId,
        ],
      );

      // If deactivated, immediately revoke all active refresh tokens for forced logout!
      if (dto.isActive === false) {
        await client.query(
          `UPDATE users SET token_version = token_version + 1 WHERE id = $1`,
          [userId],
        );
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );

        // Queue USER deactivation into sync_outbox
        const branchId = currentUser.default_branch_id || '00000000-0000-0000-0000-000000000001';
        const idempotencyKey = `USER:${userId}:DEACTIVATED:${Date.now()}`;
        await client.query(
          `INSERT INTO sync_outbox (
             id, branch_id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
           ) VALUES ($1, $2, $3, 'USER', $4, 'DELETED', $5, $6, 'PENDING')
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            generateUuidV7(),
            branchId,
            currentUser.tenant_id,
            userId,
            JSON.stringify({ userId, isActive: false, updatedBy: adminId }),
            idempotencyKey,
          ],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'USER_UPDATED', 'users', $3, $4)`,
        [
          generateUuidV7(),
          adminId,
          userId,
          JSON.stringify({ changes: dto }),
        ],
      );
    });

    return { success: true, message: 'User updated successfully' };
  }

  /**
   * 4. Toggle Active / Inactive (Enforces Last-Owner Rule & Instant Session Revocation)
   */
  async setUserActiveStatus(adminId: string, userId: string, isActive: boolean) {
    const userRes = await this.db.query(
      `SELECT u.id, u.is_active, u.default_branch_id, u.tenant_id, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('User not found.');
    const currentUser = userRes.rows[0];

    // LAST-OWNER RULE ENFORCEMENT
    if (!isActive && currentUser.role_name === 'OWNER' && currentUser.is_active) {
      const ownersCountRes = await this.db.query(
        `SELECT count(*)::int as count
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE (u.tenant_id = $1 OR $1 IS NULL) AND r.name = 'OWNER' AND u.is_active = true`,
        [currentUser.tenant_id],
      );
      const activeOwnersCount = ownersCountRes.rows[0]?.count || 0;
      if (activeOwnersCount <= 1) {
        throw new BadRequestException('The last active Owner cannot be deactivated or removed.');
      }
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET is_active = $1,
             token_version = token_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $2`,
        [isActive, userId],
      );

      // Instant revocation of all tokens if deactivated
      if (!isActive) {
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
          [userId],
        );
      }

      // Queue USER status change into sync_outbox for HQ synchronization
      const branchId = currentUser.default_branch_id || '00000000-0000-0000-0000-000000000001';
      const eventType = isActive ? 'UPDATED' : 'DELETED';
      const idempotencyKey = `USER:${userId}:${eventType}:${Date.now()}`;
      await client.query(
        `INSERT INTO sync_outbox (
           id, branch_id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
         ) VALUES ($1, $2, $3, 'USER', $4, $5, $6, $7, 'PENDING')
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          generateUuidV7(),
          branchId,
          currentUser.tenant_id,
          userId,
          eventType,
          JSON.stringify({
            userId,
            isActive,
            action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
            updatedBy: adminId,
            timestamp: new Date().toISOString(),
          }),
          idempotencyKey,
        ],
      );

      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, branch_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, $5, 'users', $6, $7)`,
        [
          generateUuidV7(),
          currentUser.tenant_id,
          branchId,
          adminId,
          isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          userId,
          JSON.stringify({ isActive }),
        ],
      );
    });

    return { success: true, isActive };
  }

  /**
   * 4b. Delete / Decommission Staff Member (Enforces Last-Owner Rule)
   */
  async deleteUser(adminId: string, userId: string) {
    const userRes = await this.db.query(
      `SELECT u.id, u.is_active, u.default_branch_id, u.tenant_id, r.name as role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId],
    );
    if (userRes.rows.length === 0) throw new NotFoundException('User not found.');
    const currentUser = userRes.rows[0];

    // LAST-OWNER RULE ENFORCEMENT
    if (currentUser.role_name === 'OWNER' && currentUser.is_active) {
      const ownersCountRes = await this.db.query(
        `SELECT count(*)::int as count
         FROM users u
         JOIN roles r ON r.id = u.role_id
         WHERE (u.tenant_id = $1 OR $1 IS NULL) AND r.name = 'OWNER' AND u.is_active = true`,
        [currentUser.tenant_id],
      );
      const activeOwnersCount = ownersCountRes.rows[0]?.count || 0;
      if (activeOwnersCount <= 1) {
        throw new BadRequestException('The last active Owner cannot be deactivated or removed.');
      }
    }

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET is_active = false,
             token_version = token_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $1`,
        [userId],
      );
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );

      // Queue USER deletion into sync_outbox
      const branchId = currentUser.default_branch_id || '00000000-0000-0000-0000-000000000001';
      const idempotencyKey = `USER:${userId}:DELETED:${Date.now()}`;
      await client.query(
        `INSERT INTO sync_outbox (
           id, branch_id, tenant_id, aggregate_type, aggregate_id, event_type, payload, idempotency_key, status
         ) VALUES ($1, $2, $3, 'USER', $4, 'DELETED', $5, $6, 'PENDING')
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          generateUuidV7(),
          branchId,
          currentUser.tenant_id,
          userId,
          JSON.stringify({ userId, isDeleted: true, updatedBy: adminId }),
          idempotencyKey,
        ],
      );

      await client.query(
        `INSERT INTO audit_logs (id, tenant_id, branch_id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, $3, $4, 'USER_DELETED', 'users', $5, $6)`,
        [generateUuidV7(), currentUser.tenant_id, branchId, adminId, userId, JSON.stringify({ userId })],
      );
    });

    return { success: true, message: 'User deleted and sessions terminated.' };
  }

  /**
   * 5. Admin Password Reset
   */
  async adminResetPassword(adminId: string, userId: string, dto: AdminResetPasswordDto) {
    const newHash = await this.hash(dto.newPassword);

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             failed_login_attempts = 0,
             locked_until = NULL,
             force_password_change = $2,
             token_version = token_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $3`,
        [newHash, dto.forcePasswordChange ?? true, userId],
      );

      // Invalidate existing sessions to force login with new credentials
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );

      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'ADMIN_PASSWORD_RESET', 'users', $3, $4)`,
        [
          generateUuidV7(),
          adminId,
          userId,
          JSON.stringify({ forcePasswordChange: dto.forcePasswordChange ?? true }),
        ],
      );
    });

    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * 6. Admin PIN Reset
   */
  async adminResetPin(adminId: string, userId: string, dto: AdminResetPinDto) {
    const pinHash = await this.hash(dto.newPin);

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET pin_hash = $1,
             pin_failed_attempts = 0,
             pin_locked_until = NULL,
             token_version = token_version + 1,
             updated_at = clock_timestamp()
         WHERE id = $2`,
        [pinHash, userId],
      );

      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'ADMIN_PIN_RESET', 'users', $3, $4)`,
        [generateUuidV7(), adminId, userId, JSON.stringify({ pinLength: dto.newPin.length })],
      );
    });

    return { success: true, message: 'Cashier PIN reset successfully' };
  }

  /**
   * 7. List Roles & Permission Matrix
   */
  async listRoles() {
    const res = await this.db.query(`
      SELECT r.id, r.name, r.description, r.is_system, r.max_discount_percentage,
             COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      GROUP BY r.id, r.name, r.description, r.is_system, r.max_discount_percentage
      ORDER BY r.created_at ASC
    `);

    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isSystem: row.is_system,
      maxDiscountPercentage: parseFloat(row.max_discount_percentage),
      permissions: row.permissions || [],
    }));
  }

  /**
   * 8. Create Custom Role
   */
  async createRole(adminId: string, dto: CreateRoleDto) {
    const roleName = dto.name.toUpperCase().trim();
    const existing = await this.db.query(
      `SELECT id FROM roles WHERE UPPER(name) = $1`,
      [roleName],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Role '${roleName}' already exists.`);
    }

    const roleId = generateUuidV7();
    const maxDiscount = dto.maxDiscountPercentage !== undefined ? dto.maxDiscountPercentage : 0;

    await this.db.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO roles (id, name, description, is_system, max_discount_percentage)
         VALUES ($1, $2, $3, FALSE, $4)`,
        [roleId, roleName, dto.description || '', maxDiscount],
      );

      if (dto.permissions && dto.permissions.length > 0) {
        for (const permId of dto.permissions) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [roleId, permId],
          );
        }
      }

      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'ROLE_CREATED', 'roles', $3, $4)`,
        [
          generateUuidV7(),
          adminId,
          roleId,
          JSON.stringify({ name: roleName, permissions: dto.permissions || [] }),
        ],
      );
    });

    return {
      id: roleId,
      name: roleName,
      description: dto.description || '',
      isSystem: false,
      maxDiscountPercentage: maxDiscount,
      permissions: dto.permissions || [],
    };
  }

  /**
   * 8b. Delete Custom Role (System roles cannot be deleted)
   */
  async deleteRole(adminId: string, roleId: string) {
    const roleRes = await this.db.query(
      `SELECT id, name, is_system FROM roles WHERE id = $1`,
      [roleId],
    );
    if (roleRes.rows.length === 0) throw new NotFoundException('Role not found.');
    if (roleRes.rows[0].is_system) {
      throw new BadRequestException('System roles cannot be deleted.');
    }

    const assignedCountRes = await this.db.query(
      `SELECT count(*)::int as count FROM users WHERE role_id = $1`,
      [roleId],
    );
    if ((assignedCountRes.rows[0]?.count || 0) > 0) {
      throw new BadRequestException('Cannot delete role with assigned users. Reassign users first.');
    }

    await this.db.withTransaction(async (client) => {
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
      await client.query(`DELETE FROM roles WHERE id = $1`, [roleId]);
      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'ROLE_DELETED', 'roles', $3, $4)`,
        [generateUuidV7(), adminId, roleId, JSON.stringify({ name: roleRes.rows[0].name })],
      );
    });

    return { success: true, message: 'Role deleted successfully' };
  }

  /**
   * 8c. Update Role Permissions & Discount Limit
   */
  async updateRolePermissions(adminId: string, roleId: string, dto: UpdateRolePermissionsDto) {
    const roleRes = await this.db.query(`SELECT id, name FROM roles WHERE id = $1`, [roleId]);
    if (roleRes.rows.length === 0) throw new NotFoundException('Role not found.');

    await this.db.withTransaction(async (client) => {
      // Clear existing
      await client.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

      // Insert new permissions
      for (const permId of dto.permissionIds) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permId],
        );
      }

      if (dto.maxDiscountPercentage !== undefined) {
        await client.query(
          `UPDATE roles SET max_discount_percentage = $1, updated_at = clock_timestamp() WHERE id = $2`,
          [dto.maxDiscountPercentage, roleId],
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, user_id, action, entity_name, entity_id, details)
         VALUES ($1, $2, 'ROLE_PERMISSIONS_CHANGED', 'roles', $3, $4)`,
        [
          generateUuidV7(),
          adminId,
          roleId,
          JSON.stringify({
            role: roleRes.rows[0].name,
            permissionsCount: dto.permissionIds.length,
            maxDiscountPercentage: dto.maxDiscountPercentage,
          }),
        ],
      );
    });

    return { success: true, message: 'Role permissions updated successfully' };
  }

  /**
   * 9. List All System Permissions
   */
  async listPermissions() {
    const res = await this.db.query(
      `SELECT id, module, description FROM permissions ORDER BY module, id`,
    );
    return res.rows;
  }

  private async getDefaultBranchId(): Promise<string> {
    const res = await this.db.query(
      `SELECT id FROM branches ORDER BY is_hq DESC, created_at ASC LIMIT 1`,
    );
    return res.rows[0]?.id || '00000000-0000-0000-0000-000000000001';
  }
}
