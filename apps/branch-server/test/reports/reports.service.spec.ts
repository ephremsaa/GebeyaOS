import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { DatabaseService } from '../../src/common/database/database.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    };

    service = new ReportsService(mockDb as unknown as DatabaseService);
  });

  describe('getAddisDateRange (Africa/Addis_Ababa Timezone Math)', () => {
    it('calculates exact EAT (UTC+3) day boundaries for today', () => {
      const range = service.getAddisDateRange('today');
      expect(range.label).toBe('Today');
      // EAT is UTC+3: difference between end and start should be exactly 24 hours - 1 ms
      const diffMs = range.end.getTime() - range.start.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000 - 1);

      // Start of day in Addis (00:00:00 EAT) corresponds to 21:00:00 UTC previous calendar day
      expect(range.start.getUTCHours()).toBe(21);
      // End of day in Addis (23:59:59.999 EAT) corresponds to 20:59:59.999 UTC
      expect(range.end.getUTCHours()).toBe(20);
      expect(range.end.getUTCMinutes()).toBe(59);
    });

    it('calculates exact EAT boundaries for yesterday', () => {
      const range = service.getAddisDateRange('yesterday');
      expect(range.label).toBe('Yesterday');
      const diffMs = range.end.getTime() - range.start.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000 - 1);
      expect(range.start.getUTCHours()).toBe(21);
    });

    it('handles custom date range string inputs', () => {
      const range = service.getAddisDateRange('custom', '2026-10-01', '2026-10-05');
      expect(range.label).toBe('Custom Range');
      // 2026-10-01 00:00:00 EAT is 2026-09-30T21:00:00.000Z in UTC
      expect(range.start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
      // 2026-10-05 23:59:59.999 EAT is 2026-10-05T20:59:59.999Z in UTC
      expect(range.end.toISOString()).toBe('2026-10-05T20:59:59.999Z');
    });
  });

  describe('getDailySalesReport & Reconciliation', () => {
    it('aggregates daily sales, VAT breakdown, payment methods, and cashier shift audits', async () => {
      // 1. Sales query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            total_sales_count: '25',
            gross_sales: '12500.0000',
            discount_total: '500.0000',
            taxable_subtotal: '10434.7826',
            tax_exempt_subtotal: '0.0000',
            tax_total: '1565.2174',
            net_sales: '12000.0000',
          },
        ],
      });

      // 2. Payments breakdown query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            payment_method: 'CASH',
            total_amount: '7000.0000',
            transaction_count: '15',
          },
          {
            payment_method: 'TELEBIRR',
            total_amount: '5000.0000',
            transaction_count: '10',
          },
        ],
      });

      // 3. Cashier audits query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            cashier_id: 'cashier-01',
            shift_count: '2',
            opening_float_total: '2000.0000',
            closing_counted_total: '8980.0000',
            expected_cash_total: '9000.0000',
            net_variance: '-20.0000',
          },
        ],
      });

      // 4. Line VAT query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ line_vat_sum: '1565.2174' }],
      });

      // 5. Hourly query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { sale_hour: '9', tx_count: '5', gross_amount: '2500.00' },
          { sale_hour: '14', tx_count: '12', gross_amount: '6000.00' },
        ],
      });

      // 6. Category query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            category_id: 'cat-01',
            category_name: 'Bakery & Grains',
            gross_revenue: '4500.00',
            cogs: '3000.00',
            units_pcs: '30',
            units_kg: '15',
            units_other: '0',
          },
        ],
      });

      const report = await service.getDailySalesReport('branch-01');

      expect(report.totalSalesCount).toBe(25);
      expect(report.grossSalesAmount).toBe(12500);
      expect(report.discountTotal).toBe(500);
      expect(report.taxTotal).toBe(1565.22);
      expect(report.netSalesAmount).toBe(12000);

      expect(report.paymentBreakdown).toHaveLength(2);
      expect(report.paymentBreakdown[0].paymentMethod).toBe('CASH');
      expect(report.paymentBreakdown[0].totalAmount).toBe(7000);

      expect(report.cashierAudits).toHaveLength(1);
      expect(report.cashierAudits[0].netVariance).toBe(-20);

      // Reconciliation tests
      expect(report.vatReconciliation).toBeDefined();
      expect(report.vatReconciliation!.isVatReconciled).toBe(true);
      expect(report.vatReconciliation!.isPaymentReconciled).toBe(true);
      expect(report.vatReconciliation!.sumOfPayments).toBe(12000);
      expect(report.vatReconciliation!.sumOfLineVat).toBe(1565.22);
    });

    it('separates taxable and tax-exempt sales correctly for Ethiopian tax law', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            {
              total_sales_count: '10',
              gross_sales: '8000.0000',
              discount_total: '0.0000',
              taxable_subtotal: '4347.8261', // Taxable items (15% VAT)
              tax_exempt_subtotal: '3000.0000', // Exempt items (Teff, raw grains, medicine)
              tax_total: '652.1739', // 15% of 4347.83
              net_sales: '8000.0000',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ payment_method: 'CASH', total_amount: '8000.0000', transaction_count: '10' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ line_vat_sum: '652.1739' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const report = await service.getDailySalesReport('branch-01');

      expect(report.taxableSubtotal).toBe(4347.83);
      expect(report.taxExemptSubtotal).toBe(3000.0);
      expect(report.taxTotal).toBe(652.17);
      expect(report.vatReconciliation!.taxExemptSales).toBe(3000);
      expect(report.vatReconciliation!.taxableSales).toBe(4347.83);
      expect(report.vatReconciliation!.isVatReconciled).toBe(true);
    });
  });

  describe('getProductProfitabilityReport', () => {
    it('calculates COGS, gross profit, and margin percentage per product and overall', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            product_id: 'prod-honey',
            sku: 'SKU-HONEY',
            name_en: 'Raw Honey 1KG',
            uom_code: 'KG',
            quantity_sold: '10.000',
            gross_revenue: '3500.0000',
            discount_amount: '0.0000',
            net_revenue: '3500.0000',
            cogs: '2500.0000', // 250 ETB unit cost
          },
          {
            product_id: 'prod-bread',
            sku: 'SKU-BREAD',
            name_en: 'Bakery Toast',
            uom_code: 'PCS',
            quantity_sold: '20.000',
            gross_revenue: '1000.0000',
            discount_amount: '0.0000',
            net_revenue: '1000.0000',
            cogs: '700.0000', // 35 ETB unit cost
          },
        ],
      });

      const report = await service.getProductProfitabilityReport('branch-01');

      expect(report.items).toHaveLength(2);

      // Honey: Net 3,500, COGS 2,500 -> Profit 1,000 -> Margin: (1000/3500) * 100 = 28.57%
      expect(report.items[0].grossProfit).toBe(1000);
      expect(report.items[0].marginPercentage).toBe(28.57);
      expect(report.items[0].uom).toBe('KG');

      // Bread: Net 1,000, COGS 700 -> Profit 300 -> Margin: 30%
      expect(report.items[1].grossProfit).toBe(300);
      expect(report.items[1].marginPercentage).toBe(30);
      expect(report.items[1].uom).toBe('PCS');

      // Overall: Revenue 4,500, COGS 3,200 -> Profit 1,300 -> Margin: (1300/4500) * 100 = 28.89%
      expect(report.totalRevenue).toBe(4500);
      expect(report.totalCOGS).toBe(3200);
      expect(report.totalGrossProfit).toBe(1300);
      expect(report.overallMarginPercentage).toBe(28.89);
    });
  });

  describe('getStockValuationReport & Unit Segregation (Pcs vs Kg)', () => {
    it('summarizes stock on hand, valuation in ETB, and NEVER adds different units into one total (pcs vs kg)', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            category_id: 'cat-dairy',
            category_name: 'Dairy & Eggs',
            product_id: 'p-milk',
            sku: 'MILK-01',
            product_name: 'Fresh Milk 1L',
            uom_code: 'PCS',
            cost_price: '80.0000',
            min_stock: '20.000',
            quantity_on_hand: '15.000', // 15 pcs
          },
          {
            category_id: 'cat-dairy',
            category_name: 'Dairy & Eggs',
            product_id: 'p-butter',
            sku: 'BUTTER-01',
            product_name: 'Sheno Butter',
            uom_code: 'KG',
            cost_price: '600.0000',
            min_stock: '5.000',
            quantity_on_hand: '8.500', // 8.5 kg
          },
          {
            category_id: 'cat-beverage',
            category_name: 'Beverages',
            product_id: 'p-water',
            sku: 'WATER-01',
            product_name: 'Ambo Water 500ml',
            uom_code: 'PACK',
            cost_price: '200.0000',
            min_stock: '10.000',
            quantity_on_hand: '50.000', // 50 packs (pcs)
          },
        ],
      });

      const report = await service.getStockValuationReport('branch-01');

      expect(report.totalProducts).toBe(3);
      // Valuation = (15 * 80) + (8.5 * 600) + (50 * 200) = 1200 + 5100 + 10000 = 16300 ETB
      expect(report.totalValuationETB).toBe(16300);
      expect(report.lowStockItemsCount).toBe(1);

      // Check category unit segregation
      const dairy = report.categories.find((c) => c.categoryId === 'cat-dairy');
      expect(dairy).toBeDefined();
      expect(dairy!.totalQuantityPcs).toBe(15); // Milk pcs
      expect(dairy!.totalQuantityKg).toBe(8.5); // Butter kg
      // Units are strictly separated in reporting
      expect(dairy!.totalValuation).toBe(6300);

      const bev = report.categories.find((c) => c.categoryId === 'cat-beverage');
      expect(bev!.totalQuantityPcs).toBe(50);
      expect(bev!.totalQuantityKg).toBe(0);
    });
  });

  describe('getExpiringStockReport', () => {
    it('identifies expiring and expired batches with potential loss calculations', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            batch_id: 'b-expired',
            batch_number: 'B-EXP-01',
            product_id: 'p-yogurt',
            product_name: 'Strawberry Yogurt',
            uom_code: 'PCS',
            expiry_date: new Date('2026-10-15'),
            current_quantity: '5.000',
            unit_cost: '40.0000',
            days_until_expiry: '-6', // Expired 6 days ago
          },
          {
            batch_id: 'b-expiring-soon',
            batch_number: 'B-EXP-02',
            product_id: 'p-milk',
            product_name: 'Fresh Milk',
            uom_code: 'PCS',
            expiry_date: new Date('2026-10-25'),
            current_quantity: '10.000',
            unit_cost: '80.0000',
            days_until_expiry: '4', // Expiring in 4 days
          },
        ],
      });

      const report = await service.getExpiringStockReport('branch-01', 30);

      expect(report.totalExpiringBatches).toBe(2);
      expect(report.batches).toHaveLength(2);

      // Expired: 5 * 40 = 200 ETB
      expect(report.alreadyExpiredValueETB).toBe(200);
      expect(report.batches[0].isExpired).toBe(true);

      // Expiring soon: 10 * 80 = 800 ETB
      expect(report.totalExpiringValueETB).toBe(800);
      expect(report.batches[1].isExpired).toBe(false);
      expect(report.batches[1].daysUntilExpiry).toBe(4);
    });
  });

  describe('getCashierPerformanceReport', () => {
    it('aggregates shifts, drawer compliance, and transaction volumes per cashier', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            cashier_id: 'c-01',
            cashier_name: 'Bethlehem Tadesse',
            shifts_count: '4',
            transactions_processed: '120',
            opening_float_total: '4000.0000',
            closing_counted_total: '24000.0000',
            expected_cash_total: '24000.0000',
            total_variance: '0.0000', // Perfect drawer tally
            total_sales: '20000.0000',
            zero_variance_shifts: '4',
          },
          {
            cashier_id: 'c-02',
            cashier_name: 'Yonas Kebede',
            shifts_count: '2',
            transactions_processed: '45',
            opening_float_total: '2000.0000',
            closing_counted_total: '9950.0000',
            expected_cash_total: '10000.0000',
            total_variance: '-50.0000', // Short 50 ETB
            total_sales: '8000.0000',
            zero_variance_shifts: '1',
          },
        ],
      });

      const cashiers = await service.getCashierPerformanceReport('branch-01');

      expect(cashiers).toHaveLength(2);
      expect(cashiers[0].cashierName).toBe('Bethlehem Tadesse');
      expect(cashiers[0].accuracyRate).toBe(100);
      expect(cashiers[0].totalVariance).toBe(0);

      expect(cashiers[1].cashierName).toBe('Yonas Kebede');
      expect(cashiers[1].accuracyRate).toBe(50);
      expect(cashiers[1].totalVariance).toBe(-50);
    });
  });

  describe('getBranchSyncFreshness (HQ Consolidated View)', () => {
    it('reports branch sync freshness, status (LIVE/DELAYED), and today sales for HQ consolidated dashboard', async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: 'b-01', code: 'BOLE-01', name: 'Bole Medhanialem' },
            { id: 'b-02', code: 'CMC-02', name: 'CMC Mega Hypermarket' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ last_synced_at: new Date(Date.now() - 5 * 60000) }], // 5 mins ago -> LIVE
        })
        .mockResolvedValueOnce({
          rows: [{ count: '142', total: '48650.00' }],
        })
        .mockResolvedValueOnce({
          rows: [{ last_synced_at: new Date(Date.now() - 35 * 60000) }], // 35 mins ago -> DELAYED
        })
        .mockResolvedValueOnce({
          rows: [{ count: '186', total: '62400.00' }],
        });

      const freshness = await service.getBranchSyncFreshness();

      expect(freshness).toHaveLength(2);
      expect(freshness[0].branchCode).toBe('BOLE-01');
      expect(freshness[0].status).toBe('LIVE');
      expect(freshness[0].isOnline).toBe(true);

      expect(freshness[1].branchCode).toBe('CMC-02');
      expect(freshness[1].status).toBe('DELAYED');
      expect(freshness[1].isOnline).toBe(true);
    });
  });
});
