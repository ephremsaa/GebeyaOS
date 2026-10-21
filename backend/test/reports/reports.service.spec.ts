import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockDb: Partial<DatabaseService>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };
    service = new ReportsService(mockDb as DatabaseService);
  });

  describe('classifyFreshness', () => {
    it('marks as LIVE when synced within 15 minutes', () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const result = service.classifyFreshness(fiveMinsAgo);

      expect(result.freshness).toBe('LIVE');
      expect(result.minutesSinceSync).toBe(5);
      expect(result.warning).toBeUndefined();
    });

    it('marks as DELAYED when synced 30 minutes ago', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
      const result = service.classifyFreshness(thirtyMinsAgo);

      expect(result.freshness).toBe('DELAYED');
      expect(result.minutesSinceSync).toBe(30);
      expect(result.warning).toContain('30 minutes delayed');
    });

    it('marks as STALE when synced 3 hours ago', () => {
      const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
      const result = service.classifyFreshness(threeHoursAgo);

      expect(result.freshness).toBe('STALE');
      expect(result.warning).toContain('3 hours since last sync');
    });

    it('marks as OFFLINE when never synced or offline > 24 hours', () => {
      const never = service.classifyFreshness(null);
      expect(never.freshness).toBe('OFFLINE');
      expect(never.warning).toContain('never synced');

      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const stale = service.classifyFreshness(twoDaysAgo);
      expect(stale.freshness).toBe('OFFLINE');
      expect(stale.warning).toContain('BRANCH OFFLINE (2 days');
    });
  });

  describe('generateCsv', () => {
    it('escapes commas, quotes, and newlines properly in CSV output', () => {
      const headers = ['Name', 'Price', 'Description'];
      const rows = [
        ['Teff Flour, Grade 1', 120.5, 'Pure Magna teff'],
        ['Special "Bole" Honey', 450.0, 'Organic honey\nHarvest 2026'],
      ];

      const csv = service.generateCsv(headers, rows);

      expect(csv).toContain('"Teff Flour, Grade 1",120.5,Pure Magna teff');
      expect(csv).toContain('"Special ""Bole"" Honey",450,"Organic honey\nHarvest 2026"');
    });
  });

  describe('getProfitAndMarginReport', () => {
    it('accurately computes gross profit and margin percentages', async () => {
      (mockDb.query as any).mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            category_name: 'Cooking Oil',
            product_id: 'prod-oil',
            sku: 'OIL-5L',
            product_name: 'Sunflower Oil 5L',
            total_quantity_sold: '10',
            total_revenue: '10000.0000', // 10,000 ETB
            total_cogs: '8000.0000', // 8,000 ETB
          },
        ],
      });

      const report = await service.getProfitAndMarginReport({
        branch_id: 'branch-1',
      });

      expect(report.total_revenue).toBe(10000.0);
      expect(report.total_cogs).toBe(8000.0);
      expect(report.total_gross_profit).toBe(2000.0);
      expect(report.overall_margin_percentage).toBe(20.0); // 20% margin
    });
  });
});
