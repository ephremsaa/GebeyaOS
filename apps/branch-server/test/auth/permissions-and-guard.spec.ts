import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../src/common/guards/permissions.guard';
import { JwtAuthGuard, JWT_SECRET } from '../../src/common/guards/jwt-auth.guard';
import { DatabaseService } from '../../src/common/database/database.service';
import * as jwt from 'jsonwebtoken';

describe('Permission Enforcement & Session Revocation Guards', () => {
  let permissionsGuard: PermissionsGuard;
  let reflector: Reflector;
  let jwtGuard: JwtAuthGuard;
  let mockDb: any;

  beforeEach(() => {
    reflector = new Reflector();
    permissionsGuard = new PermissionsGuard(reflector);
    mockDb = {
      query: vi.fn(),
    };
    jwtGuard = new JwtAuthGuard(mockDb as DatabaseService);
  });

  const createMockContext = (user: any, requiredPermissions?: string[]): ExecutionContext => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredPermissions);
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers: {
            authorization: user?.token ? `Bearer ${user.token}` : undefined,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('PermissionsGuard Enforcement', () => {
    it('allows access if no permissions are required', () => {
      const ctx = createMockContext({ role: 'CASHIER', permissions: [] }, undefined);
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('grants unconditional sovereignty to OWNER role regardless of permission list', () => {
      const ctx = createMockContext(
        { role: 'OWNER', permissions: [] },
        ['catalog:cost:view', 'admin:users:manage'],
      );
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('allows access when user possesses all required permissions', () => {
      const ctx = createMockContext(
        {
          role: 'STOREKEEPER',
          permissions: ['catalog:cost:view', 'inventory:adjust:create'],
        },
        ['catalog:cost:view'],
      );
      expect(permissionsGuard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException when user is missing required granular permission', () => {
      const ctx = createMockContext(
        {
          role: 'CASHIER',
          permissions: ['pos:sale:create', 'pos:shift:close'],
        },
        ['catalog:cost:view'], // Cashier should not view cost
      );
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => permissionsGuard.canActivate(ctx)).toThrow(/Insufficient permissions/);
    });
  });

  describe('JwtAuthGuard & Immediate Deactivation Session Revocation', () => {
    it('allows authenticated active user', async () => {
      const token = jwt.sign({ sub: 'user-active-1' }, JWT_SECRET);
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${token}` },
          }),
        }),
      } as unknown as ExecutionContext;

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-active-1',
            username: 'abebe',
            is_active: true,
            role_name: 'CASHIER',
            permissions: ['pos:sale:create'],
          },
        ],
      });

      const canActivate = await jwtGuard.canActivate(ctx);
      expect(canActivate).toBe(true);
    });

    it('immediately rejects session token if user has been deactivated', async () => {
      const token = jwt.sign({ sub: 'user-deactivated-1' }, JWT_SECRET);
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: `Bearer ${token}` },
          }),
        }),
      } as unknown as ExecutionContext;

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-deactivated-1',
            username: 'terminated_cashier',
            is_active: false, // Deactivated!
            role_name: 'CASHIER',
          },
        ],
      });

      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(
        /User account has been deactivated. Session terminated/,
      );
    });
  });
});
