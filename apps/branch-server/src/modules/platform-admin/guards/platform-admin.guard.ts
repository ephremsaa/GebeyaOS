import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../../common/database/database.service';
import { JWT_SECRET } from '../../../common/guards/jwt-auth.guard';
import { PLATFORM_JWT_SECRET } from '../../../common/security/token.service';
import { PlatformAdminUser } from '@gebeyaos/shared-types';

export interface AuthenticatedPlatformRequest extends Request {
  platformAdmin: PlatformAdminUser;
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Platform administration requires a valid bearer token');
    }

    const token = authHeader.substring(7);
    let decoded: any;

    try {
      decoded = jwt.verify(token, PLATFORM_JWT_SECRET);
    } catch {
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch {
        throw new UnauthorizedException('Platform session token has expired or is invalid');
      }
    }

    if (!decoded || !decoded.isPlatformAdmin || !decoded.sub) {
      throw new ForbiddenException('Access denied: platform administrator privileges required');
    }

    const res = await this.db.query(
      `SELECT id, username, full_name, email, role, is_active, last_login_at, ip_allowlist, token_version
       FROM platform_admins
       WHERE id = $1`,
      [decoded.sub],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Platform administrator account not found');
    }

    const admin = res.rows[0];
    if (!admin.is_active) {
      throw new ForbiddenException('Platform administrator account is suspended');
    }

    if (decoded.tokenVersion && admin.token_version && decoded.tokenVersion !== admin.token_version) {
      throw new UnauthorizedException('Platform session has been revoked. Please sign in again.');
    }

    // IP Allowlist enforcement if configured
    if (admin.ip_allowlist && admin.ip_allowlist.length > 0) {
      const clientIp = request.ip || request.socket?.remoteAddress;
      if (clientIp && !admin.ip_allowlist.includes(clientIp) && !admin.ip_allowlist.includes('127.0.0.1')) {
        throw new ForbiddenException(`Access forbidden from client IP ${clientIp}`);
      }
    }

    request.platformAdmin = {
      id: admin.id,
      username: admin.username,
      fullName: admin.full_name,
      email: admin.email,
      role: admin.role,
      lastLoginAt: admin.last_login_at ? new Date(admin.last_login_at).toISOString() : null,
      familyId: decoded.familyId,
    };

    return true;
  }
}

