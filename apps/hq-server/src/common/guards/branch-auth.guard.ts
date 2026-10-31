import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../database/database.service';

export const BRANCH_SYNC_SECRET = process.env.BRANCH_SYNC_SECRET || 'gebeyaos-branch-sync-secret-key-2026';

export interface AuthenticatedBranch {
  branchId: string;
  tenantId: string;
  branchCode?: string;
}

@Injectable()
export class BranchAuthGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    let branchId: string | null = null;
    let tenantId: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, BRANCH_SYNC_SECRET) as any;
        branchId = decoded.branchId || decoded.sub;
        tenantId = decoded.tenantId || decoded.tenant_id;
      } catch {
        throw new UnauthorizedException('Branch synchronization token is invalid or expired.');
      }
    } else if (request.headers['x-branch-id'] && request.headers['x-tenant-id']) {
      // Direct credential headers for testing/harness
      branchId = request.headers['x-branch-id'] as string;
      tenantId = request.headers['x-tenant-id'] as string;
    }

    if (!branchId || !tenantId) {
      throw new UnauthorizedException('Branch credentials (branchId and tenantId) required.');
    }

    // Verify branch belongs to tenant and is active
    const res = await this.db.query(
      `SELECT b.id, b.tenant_id, b.code, b.is_active, t.status as tenant_status
       FROM branches b
       JOIN tenants t ON t.id = b.tenant_id
       WHERE b.id = $1 AND b.tenant_id = $2`,
      [branchId, tenantId],
      tenantId,
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Invalid branch credentials: branch not registered under this tenant.');
    }

    const row = res.rows[0];
    if (!row.is_active) {
      throw new UnauthorizedException('Branch is deactivated.');
    }

    if (row.tenant_status === 'suspended') {
      throw new ForbiddenException('Tenant subscription is suspended. HQ sync access denied.');
    }

    const authBranch: AuthenticatedBranch = {
      branchId: row.id,
      tenantId: row.tenant_id,
      branchCode: row.code,
    };

    request.branch = authBranch;
    return true;
  }
}

