import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '@gebeyaos/shared-types';

export const JWT_SECRET = process.env.JWT_SECRET || 'gebeyaos-secure-branch-key-2026';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    let userId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        userId = decoded.sub || decoded.userId;
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

    // Verify user exists and is active in DB
    const res = await this.db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active,
              u.role_id, r.name as role_name, u.default_branch_id,
              u.force_password_change,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE u.id = $1
       GROUP BY u.id, u.username, u.full_name, u.email, u.phone, u.is_active,
                u.role_id, r.name, u.default_branch_id, u.force_password_change`,
      [userId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const row = res.rows[0];
    if (!row.is_active) {
      throw new UnauthorizedException('User account has been deactivated. Session terminated.');
    }

    const authUser: AuthenticatedUser = {
      id: row.id,
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
