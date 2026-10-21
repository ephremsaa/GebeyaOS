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

  describe('getDailySalesReport', () => {
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

      // Bread: Net 1,000, COGS 700 -> Profit 300 -> Margin: 30%
      expect(report.items[1].grossProfit).toBe(300);
      expect(report.items[1].marginPercentage).toBe(30);

      // Overall: Revenue 4,500, COGS 3,200 -> Profit 1,300 -> Margin: (1300/4500) * 100 = 28.89%
      expect(report.totalRevenue).toBe(4500);
      expect(report.totalCOGS).toBe(3200);
      expect(report.totalGrossProfit).toBe(1300);
      expect(report.overallMarginPercentage).toBe(28.89);
    });
  });

  describe('getStockValuationReport', () => {
    it('summarizes stock on hand, valuation in ETB by category, and low stock items', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            category_id: 'cat-dairy',
            category_name: 'Dairy & Eggs',
            product_id: 'p-milk',
            cost_price: '80.0000',
            min_stock: '20.000',
            quantity_on_hand: '15.000', // Low stock! 15 <= 20
          },
          {
            category_id: 'cat-dairy',
            category_name: 'Dairy & Eggs',
            product_id: 'p-butter',
            cost_price: '150.0000',
            min_stock: '10.000',
            quantity_on_hand: '25.000', // Adequate stock
          },
          {
            category_id: 'cat-beverage',
            category_name: 'Beverages',
            product_id: 'p-water',
            cost_price: '20.0000',
            min_stock: '50.000',
            quantity_on_hand: '100.000',
          },
        ],
      });

      const report = await service.getStockValuationReport('branch-01');

      expect(report.totalProducts).toBe(3);
      // Total Qty = 15 + 25 + 100 = 140
      expect(report.totalQuantityOnHand).toBe(140);
      // Valuation = (15 * 80) + (25 * 150) + (100 * 20) = 1200 + 3750 + 2000 = 6950 ETB
      expect(report.totalValuationETB).toBe(6950);
      expect(report.lowStockItemsCount).toBe(1);

      expect(report.categories).toHaveLength(2);
      const dairy = report.categories.find((c) => c.categoryId === 'cat-dairy');
      expect(dairy).toBeDefined();
      expect(dairy!.productCount).toBe(2);
      expect(dairy!.totalValuation).toBe(4950);
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
});
