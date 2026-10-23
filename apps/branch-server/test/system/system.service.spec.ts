import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { SystemService } from '../../src/modules/system/system.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('SystemService', () => {
  let service: SystemService;
  let mockDb: Partial<DatabaseService>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
      withTransaction: vi.fn(),
    };
    service = new SystemService(mockDb as DatabaseService);
  });

  describe('getDashboardSummary', () => {
    it('aggregates sales, cash vs digital payments, inventory health, and outbox queue', async () => {
      // 1. Sales query mock
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [
          {
            gross_sales: '45000.50',
            net_sales: '39130.87',
            transaction_count: '124',
            tax_total: '5869.63',
          },
        ],
      });

      // 2. Payments query mock
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [
          { payment_method: 'CASH', total_amount: '30000.50' },
          { payment_method: 'TELEBIRR', total_amount: '15000.00' },
        ],
      });

      // 3. Products stock counts mock
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [
          {
            total_active: '150',
            low_stock: '8',
            out_of_stock: '2',
          },
        ],
      });

      // 4. Expiring batches query mock
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });

      // 5. Sync outbox mock
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ pending_count: '5' }],
      });

      const summary = await service.getDashboardSummary('branch-01');

      expect(summary.todaySales.grossSales).toBe(45000.5);
      expect(summary.todaySales.cashCollected).toBe(30000.5);
      expect(summary.todaySales.digitalCollected).toBe(15000.0);
      expect(summary.inventorySummary.totalActiveProducts).toBe(150);
      expect(summary.inventorySummary.lowStockCount).toBe(8);
      expect(summary.inventorySummary.outOfStockCount).toBe(2);
      expect(summary.inventorySummary.expiringBatchesCount).toBe(3);
      expect(summary.syncStatus.pendingOutboxCount).toBe(5);
      expect(summary.cashDrawer.thresholdAlert).toBe(false);
    });
  });

  describe('createBackup & restoreBackup', () => {
    it('exports tables and generates valid SHA-256 integrity checksum', async () => {
      (mockDb.query as any).mockImplementation((sql: string) => {
        if (sql.includes('FROM products')) {
          return Promise.resolve({
            rows: [{ id: 'p1', sku: 'TEST-SKU', name_en: 'Test Product' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const backup = await service.createBackup('branch-01');

      expect(backup.metadata.branchId).toBe('branch-01');
      expect(backup.metadata.sha256).toBeDefined();
      expect(backup.tables['products'].length).toBe(1);

      // Verify SHA-256 matches actual payload
      const expectedSha = crypto
        .createHash('sha256')
        .update(JSON.stringify(backup.tables))
        .digest('hex');
      expect(backup.metadata.sha256).toBe(expectedSha);
    });

    it('rejects restore if SHA-256 checksum does not match corrupted payload', async () => {
      const backupPayload = {
        metadata: {
          version: '1.0.0',
          branchId: 'branch-01',
          timestamp: new Date().toISOString(),
          sha256: 'tampered-or-invalid-hash',
          recordCounts: {},
        },
        tables: {
          products: [{ id: 'p1' }],
        },
      };

      await expect(
        service.restoreBackup({ backupPayload } as any, 'user-01'),
      ).rejects.toThrow('Integrity check failed');
    });

    it('successfully restores valid payload in transaction', async () => {
      const tables = {
        system_settings: [{ key: 'store_info', value: { name: 'Restored Store' } }],
        categories: [{ id: 'c1', code: 'CAT1', name_en: 'Cat 1', name_am: null, parent_id: null, sort_order: 1 }],
      };
      const sha256 = crypto
        .createHash('sha256')
        .update(JSON.stringify(tables))
        .digest('hex');

      const backupPayload = {
        metadata: {
          version: '1.0.0',
          branchId: 'branch-01',
          timestamp: new Date().toISOString(),
          sha256,
          recordCounts: { system_settings: 1, categories: 1 },
        },
        tables,
      };

      (mockDb.withTransaction as any).mockImplementation(async (cb: any) => {
        const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
        return cb(client);
      });
      (mockDb.query as any).mockResolvedValue({ rows: [] });

      const result = await service.restoreBackup({ backupPayload } as any, 'user-01');

      expect(result.success).toBe(true);
      expect(result.verifiedSha256).toBe(sha256);
    });
  });

  describe('getNotifications', () => {
    it('aggregates stockouts, expiries, and sync queue warnings', async () => {
      // 1. Stockout query
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ id: 'p1', sku: 'SKU-01', name_en: 'Cooking Oil', soh: '0' }],
      });

      // 2. Expiries query
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [
          {
            id: 'b1',
            batch_number: 'BATCH-2026',
            expiry_date: '2026-11-01',
            current_quantity: '20',
            name_en: 'Milk 1L',
          },
        ],
      });

      // 3. Sync pending count
      (mockDb.query as any).mockResolvedValueOnce({
        rows: [{ count: '45' }],
      });

      const notifications = await service.getNotifications('branch-01');

      expect(notifications.length).toBe(3);
      expect(notifications[0].type).toBe('STOCKOUT');
      expect(notifications[1].type).toBe('EXPIRY');
      expect(notifications[2].type).toBe('SYNC');
    });
  });
});
