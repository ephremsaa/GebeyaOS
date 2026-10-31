import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { JwtAuthGuard, JWT_SECRET, DEFAULT_TENANT_ID } from '../../src/common/guards/jwt-auth.guard';
import { TenantContextService } from '../../src/common/tenant/tenant-context.service';
import { DatabaseService } from '../../src/common/database/database.service';
import { UnauthorizedException } from '@nestjs/common';

const TENANT_KEROD = '01900000-0000-7000-8000-000000000001';
const TENANT_MAYA = '01900000-0000-7000-8000-000000000002';

describe('Tenant-Aware Authentication & Context Middleware', () => {
  let guard: JwtAuthGuard;
  let tenantContextService: TenantContextService;
  let mockDb: any;

  beforeEach(() => {
    tenantContextService = new TenantContextService();
    mockDb = {
      query: vi.fn(),
    };
    guard = new JwtAuthGuard(mockDb as unknown as DatabaseService, tenantContextService);
  });

  it('extracts tenantId strictly from verified JWT token claims', async () => {
    const validToken = jwt.sign(
      {
        sub: 'user-001',
        tenantId: TENANT_MAYA,
        branchId: 'branch-maya-01',
        role: 'BRANCH_MANAGER',
      },
      JWT_SECRET,
      { expiresIn: '1h' },
    );

    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-001',
          tenant_id: TENANT_MAYA,
          tenant_name: 'Maya Supermarket',
          tenant_slug: 'maya',
          username: 'mayamanager',
          full_name: 'Maya Manager',
          role_name: 'BRANCH_MANAGER',
          role_id: 'role-01',
          default_branch_id: 'branch-maya-01',
          is_active: true,
          permissions: ['pos:sale:create'],
        },
      ],
    });

    const mockRequest: any = {
      headers: {
        authorization: `Bearer ${validToken}`,
        // Malicious client tries to spoof a different tenant via headers/body
        'x-tenant-id': TENANT_KEROD,
      },
      body: {
        tenantId: TENANT_KEROD,
      },
      query: {
        tenantId: TENANT_KEROD,
      },
    };

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };

    const canActivate = await tenantContextService.runWithContext(
      { tenantId: '' },
      () => guard.canActivate(mockContext),
    );

    expect(canActivate).toBe(true);
    // Verified user in request must have the token's tenantId, NOT client input
    expect(mockRequest.user.tenantId).toBe(TENANT_MAYA);
    expect(mockRequest.user.tenantSlug).toBe('maya');

    // TenantContextService must have received the token's tenantId
    await tenantContextService.runWithContext({ tenantId: mockRequest.user.tenantId }, () => {
      expect(tenantContextService.getTenantId()).toBe(TENANT_MAYA);
    });

    // DatabaseService query was called with the verified tenantId
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT u.id, u.tenant_id'),
      ['user-001'],
      TENANT_MAYA,
    );
  });

  it('rejects authentication when user tenant in DB does not match token tenantId', async () => {
    const forgedToken = jwt.sign(
      {
        sub: 'user-001',
        tenantId: TENANT_KEROD, // Token claims Kerod
      },
      JWT_SECRET,
      { expiresIn: '1h' },
    );

    // DB record reveals user actually belongs to Maya
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-001',
          tenant_id: TENANT_MAYA, // Mismatched tenant in database!
          is_active: true,
          role_name: 'CASHIER',
        },
      ],
    });

    const mockRequest: any = {
      headers: {
        authorization: `Bearer ${forgedToken}`,
      },
    };

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      /Tenant mismatch/i,
    );
  });

  it('rejects expired or tampered JWT tokens', async () => {
    const tamperedToken = 'invalid.jwt.token';

    const mockRequest: any = {
      headers: {
        authorization: `Bearer ${tamperedToken}`,
      },
    };

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    };

    await expect(guard.canActivate(mockContext)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('DatabaseService query and withTransaction automatically inject set_tenant_context', async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };

    const dbService = new DatabaseService(tenantContextService);
    (dbService as any).pool = pool;

    // Set tenant context
    tenantContextService.runWithContext({ tenantId: TENANT_MAYA }, async () => {
      // 1. Single query execution
      await dbService.query('SELECT * FROM products WHERE id = $1', ['p1']);

      // Client checked out, set_tenant_context invoked with TENANT_MAYA
      expect(pool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        [TENANT_MAYA],
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT * FROM products WHERE id = $1',
        ['p1'],
      );
      expect(mockClient.release).toHaveBeenCalled();

      // 2. Transaction execution
      mockClient.query.mockClear();
      mockClient.release.mockClear();

      await dbService.withTransaction(async (client) => {
        await client.query('UPDATE products SET base_price = 50 WHERE id = $1', ['p1']);
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT set_tenant_context($1)',
        [TENANT_MAYA],
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'UPDATE products SET base_price = 50 WHERE id = $1',
        ['p1'],
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });
});
