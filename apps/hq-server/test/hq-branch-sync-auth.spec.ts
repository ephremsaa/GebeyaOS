import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as jwt from 'jsonwebtoken';
import { HqSyncService } from '../src/modules/hq-sync/hq-sync.service';
import {
  BranchAuthGuard,
  BRANCH_SYNC_SECRET,
} from '../src/common/guards/branch-auth.guard';
import { DatabaseService } from '../src/common/database/database.service';
import {
  SyncBatchPushRequest,
  PacketBuilder,
} from '@gebeyaos/sync-protocol';
import {
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';

const TENANT_KEROD = '01900000-0000-7000-8000-000000000001';
const TENANT_MAYA = '01900000-0000-7000-8000-000000000002';
const BRANCH_MAYA_01 = 'branch-maya-001';
const BRANCH_KEROD_01 = 'branch-kerod-001';

describe('HQ Branch Sync Authentication & Isolation', () => {
  let guard: BranchAuthGuard;
  let syncService: HqSyncService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };

    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(async (cb) => cb(mockClient)),
    };

    guard = new BranchAuthGuard(mockDb as unknown as DatabaseService);
    syncService = new HqSyncService(mockDb as unknown as DatabaseService);
  });

  describe('BranchAuthGuard', () => {
    it('authenticates branch with valid JWT signed with BRANCH_SYNC_SECRET', async () => {
      const branchToken = jwt.sign(
        {
          sub: BRANCH_MAYA_01,
          branchId: BRANCH_MAYA_01,
          tenantId: TENANT_MAYA,
          type: 'BRANCH_SYNC',
        },
        BRANCH_SYNC_SECRET,
        { expiresIn: '24h' },
      );

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: BRANCH_MAYA_01,
            tenant_id: TENANT_MAYA,
            code: 'MAYA-KZ-01',
            is_active: true,
            tenant_status: 'active',
          },
        ],
      });

      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${branchToken}`,
        },
      };

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      const canActivate = await guard.canActivate(mockContext);
      expect(canActivate).toBe(true);
      expect(mockRequest.branch.branchId).toBe(BRANCH_MAYA_01);
      expect(mockRequest.branch.tenantId).toBe(TENANT_MAYA);
    });

    it('rejects sync request when branch does not belong to claimed tenant', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [], // DB returns no branch matching (branchId, tenantId)
      });

      const mockRequest: any = {
        headers: {
          'x-branch-id': BRANCH_MAYA_01,
          'x-tenant-id': TENANT_KEROD, // Wrong tenant claimed!
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

    it('rejects sync request when tenant subscription is suspended (403 Forbidden)', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: BRANCH_MAYA_01,
            tenant_id: TENANT_MAYA,
            code: 'MAYA-KZ-01',
            is_active: true,
            tenant_status: 'suspended', // Suspended tenant
          },
        ],
      });

      const mockRequest: any = {
        headers: {
          'x-branch-id': BRANCH_MAYA_01,
          'x-tenant-id': TENANT_MAYA,
        },
      };

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      };

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('HqSyncService Cross-Tenant Rejection & Scoping', () => {
    it('rejects push batch if sourceBranchId does not match authenticated branch', async () => {
      const saleEvent = PacketBuilder.buildSyncEvent(
        BRANCH_KEROD_01,
        'SALE',
        'sale-01',
        'CREATED',
        { grandTotal: 500 },
      );

      const req: SyncBatchPushRequest = {
        sourceBranchId: BRANCH_KEROD_01, // Trying to push as Kerod
        batchId: 'batch-01',
        events: [saleEvent],
      };

      // Authenticated branch is Maya
      await expect(
        syncService.processBranchPush(req, TENANT_MAYA, BRANCH_MAYA_01),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects events when payload.tenant_id belongs to another tenant', async () => {
      const spoofedEvent = PacketBuilder.buildSyncEvent(
        BRANCH_MAYA_01,
        'SALE',
        'sale-02',
        'CREATED',
        {
          tenant_id: TENANT_KEROD, // Injected Kerod tenant ID
          receiptNumber: 'MAYA-001',
          grandTotal: 100,
        },
      );

      const req: SyncBatchPushRequest = {
        sourceBranchId: BRANCH_MAYA_01,
        batchId: 'batch-02',
        events: [spoofedEvent],
      };

      // Authenticated branch is Maya
      const res = await syncService.processBranchPush(
        req,
        TENANT_MAYA,
        BRANCH_MAYA_01,
      );

      expect(res.acknowledgedEventIds).toHaveLength(0);
      expect(res.failedEventIds).toContain(spoofedEvent.id);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].reason).toMatch(/Cross-tenant event rejected/i);
    });

    it('getCatalogDeltas scopes categories, products, and suppliers to authenticated tenant', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] }) // categories
        .mockResolvedValueOnce({ rows: [] }) // products
        .mockResolvedValueOnce({ rows: [] }); // suppliers

      await syncService.getCatalogDeltas(
        BRANCH_MAYA_01,
        null,
        50,
        TENANT_MAYA,
      );

      // Verify categories query included tenant_id = $1
      expect(mockDb.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('WHERE tenant_id = $1'),
        [TENANT_MAYA, expect.any(Date), 50],
        TENANT_MAYA,
      );

      // Verify products query included tenant_id = $1
      expect(mockDb.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('WHERE tenant_id = $1'),
        [TENANT_MAYA, expect.any(Date), 50],
        TENANT_MAYA,
      );
    });
  });
});

