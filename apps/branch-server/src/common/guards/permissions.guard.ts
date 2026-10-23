import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '@gebeyaos/shared-types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    // Owner has unrestricted access
    if (user.role === 'OWNER') {
      return true;
    }

    const userPerms = new Set(user.permissions || []);
    const missing = requiredPermissions.filter((p) => !userPerms.has(p));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `Insufficient permissions. Missing: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
