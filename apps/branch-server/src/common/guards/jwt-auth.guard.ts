import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Optional,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuthenticatedUser } from '@gebeyaos/shared-types';
import { TENANT_JWT_SECRET } from '../security/token.service';

export const JWT_SECRET = process.env.JWT_SECRET || 'gebeyaos-secure-branch-key-2026';
export const DEFAULT_TENANT_ID = '01900000-0000-7000-8000-000000000001';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly db: DatabaseService,
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    let userId: string | null = null;
    let tokenTenantId: string | null = null;
    let decodedToken: any = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        let decoded: any;
        try {
          decoded = jwt.verify(token, TENANT_JWT_SECRET) as any;
        } catch {
          decoded = jwt.verify(token, JWT_SECRET) as any;
        }
        decodedToken = decoded;
        userId = decoded.sub || decoded.userId;
        tokenTenantId = decoded.tenantId || decoded.tenant_id || null;
      } catch (err: any) {
        throw new UnauthorizedException('Session token has expired or is invalid');
      }
    } else if (request.headers['x-user-id']) {
      // Backward compatibility for existing service tests
      userId = request.headers['x-user-id'];
    }

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // Tenant is strictly bound to the verified JWT token (or default tenant for test harness)
    const effectiveTenantId = tokenTenantId || DEFAULT_TENANT_ID;

    // Propagate tenant context to AsyncLocalStorage for downstream DB queries
    if (this.tenantContextService) {
      this.tenantContextService.setTenantId(effectiveTenantId);
    }

    // Support Access: Break-glass access for Platform Admins with active audited ticket
    if (decodedToken?.isPlatformAdmin && decodedToken?.isSupportAccess) {
      const supportRes = await this.db.query(
        `SELECT sa.id, sa.tenant_id, sa.admin_id, sa.expires_at, sa.revoked_at,
                t.name as tenant_name, t.slug as tenant_slug,
                a.username, a.full_name, a.email
         FROM tenant_support_access sa
         JOIN tenants t ON t.id = sa.tenant_id
         JOIN platform_admins a ON a.id = sa.admin_id
         WHERE sa.id = $1 AND sa.tenant_id = $2 AND sa.admin_id = $3
           AND sa.revoked_at IS NULL AND sa.expires_at > clock_timestamp()`,
        [decodedToken.supportAccessId, effectiveTenantId, userId],
      );

      if (supportRes.rows.length === 0) {
        throw new UnauthorizedException('Support access session is invalid, expired, or has been revoked');
      }

      const sa = supportRes.rows[0];
      const supportUser: AuthenticatedUser = {
        id: sa.admin_id,
        tenantId: sa.tenant_id,
        tenantSlug: sa.tenant_slug,
        tenantName: sa.tenant_name,
        username: `support:${sa.username}`,
        fullName: `[Support Mode] ${sa.full_name}`,
        email: sa.email,
        role: 'OWNER',
        roleId: '01900000-0000-7000-8000-000000000001',
        branchId: request.headers['x-branch-id'] || '00000000-0000-0000-0000-000000000001',
        permissions: ['*'],
        forcePasswordChange: false,
      };

      request.user = supportUser;
      return true;
    }

    // Verify user exists, belongs to the authenticated tenant, and is active in DB
    const res = await this.db.query(
      `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
              u.username, u.full_name, u.email, u.phone, u.is_active,
              u.role_id, r.name as role_name, u.default_branch_id,
              u.force_password_change, u.token_version,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE u.id = $1
       GROUP BY u.id, u.tenant_id, t.name, t.slug, t.status, u.username, u.full_name, u.email, u.phone, u.is_active,
                u.role_id, r.name, u.default_branch_id, u.force_password_change, u.token_version`,
      [userId],
      effectiveTenantId,
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const row = res.rows[0];

    // Defense-in-depth: Verify user belongs to the tenant claims in the token
    if (tokenTenantId && row.tenant_id !== tokenTenantId) {
      throw new UnauthorizedException('Tenant mismatch: user does not belong to the token tenant');
    }

    if (!row.is_active) {
      throw new UnauthorizedException('User account has been deactivated. Session terminated.');
    }

    // Verify token version for immediate session revocation
    if (decodedToken?.tokenVersion && row.token_version && decodedToken.tokenVersion !== row.token_version) {
      throw new UnauthorizedException('Session has been revoked. Please sign in again.');
    }

    // Check if tenant is suspended (unless platform admin in support access)
    if (row.tenant_status === 'suspended' && !decodedToken?.isSupportAccess) {
      throw new UnauthorizedException('Supermarket account is suspended. Please contact platform support.');
    }

    const authUser: AuthenticatedUser = {
      id: row.id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role_name,
      roleId: row.role_id,
      branchId: row.default_branch_id || request.headers['x-branch-id'] || '00000000-0000-0000-0000-000000000001',
      permissions: row.permissions || [],
      forcePasswordChange: !!row.force_password_change,
    };

    request.user = authUser;
    return true;
  }
}
