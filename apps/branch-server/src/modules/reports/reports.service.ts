import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  DailySalesReport,
  ProductProfitabilityReport,
  StockValuationReport,
  ExpiringStockReport,
  PaymentMethodBreakdown,
  CashierAuditSummary,
  ProductProfitabilityItem,
  CategoryValuationSummary,
  ExpiringBatchItem,
} from '@gebeyaos/shared-types';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Generates Daily Sales Report including revenue, tax breakdown, payment breakdown, and cashier audits.
   */
  async getDailySalesReport(
    branchId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DailySalesReport> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate
      ? new Date(endDate)
      : new Date(new Date().setHours(23, 59, 59, 999));

    // 1. Sales totals
    const salesRes = await this.db.query<any>(
      `SELECT
         COUNT(id) as total_sales_count,
         COALESCE(SUM(subtotal), 0) as gross_sales,
         COALESCE(SUM(discount_total), 0) as discount_total,
         COALESCE(SUM(taxable_subtotal), 0) as taxable_subtotal,
         COALESCE(SUM(tax_exempt_subtotal), 0) as tax_exempt_subtotal,
         COALESCE(SUM(tax_total), 0) as tax_total,
         COALESCE(SUM(grand_total), 0) as net_sales
       FROM sales
       WHERE branch_id = $1
         AND created_at >= $2
         AND created_at <= $3
         AND payment_status IN ('PAID', 'PARTIALLY_REFUNDED')`,
      [branchId, start, end],
    );
    const s = salesRes.rows[0];

    // 2. Payments by method
    const paymentsRes = await this.db.query<any>(
      `SELECT
         sp.payment_method,
         COALESCE(SUM(sp.amount), 0) as total_amount,
         COUNT(sp.id) as transaction_count
       FROM sale_payments sp
       JOIN sales s ON sp.sale_id = s.id
       WHERE s.branch_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $3
         AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
       GROUP BY sp.payment_method
       ORDER BY total_amount DESC`,
      [branchId, start, end],
    );

    const paymentBreakdown: PaymentMethodBreakdown[] = paymentsRes.rows.map((r: any) => ({
      paymentMethod: r.payment_method,
      totalAmount: parseFloat(r.total_amount),
      transactionCount: parseInt(r.transaction_count, 10),
    }));

    // 3. Cashier shift audits
    const cashierRes = await this.db.query<any>(
      `SELECT
         cashier_id,
         COUNT(id) as shift_count,
         COALESCE(SUM(opening_cash_float), 0) as opening_float_total,
         COALESCE(SUM(closing_cash_counted), 0) as closing_counted_total,
         COALESCE(SUM(expected_cash_system), 0) as expected_cash_total,
         COALESCE(SUM(cash_variance), 0) as net_variance
       FROM shifts
       WHERE branch_id = $1
         AND opened_at >= $2
         AND opened_at <= $3
       GROUP BY cashier_id`,
      [branchId, start, end],
    );

    const cashierAudits: CashierAuditSummary[] = cashierRes.rows.map((r: any) => ({
      cashierId: r.cashier_id,
      shiftCount: parseInt(r.shift_count, 10),
      openingFloatTotal: parseFloat(r.opening_float_total),
      closingCountedTotal: parseFloat(r.closing_counted_total),
      expectedCashTotal: parseFloat(r.expected_cash_total),
      netVariance: parseFloat(r.net_variance),
    }));

    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    return {
      branchId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalSalesCount: parseInt(s.total_sales_count, 10),
      grossSalesAmount: r2(parseFloat(s.gross_sales)),
      discountTotal: r2(parseFloat(s.discount_total)),
      taxableSubtotal: r2(parseFloat(s.taxable_subtotal)),
      taxExemptSubtotal: r2(parseFloat(s.tax_exempt_subtotal)),
      taxTotal: r2(parseFloat(s.tax_total)),
      netSalesAmount: r2(parseFloat(s.net_sales)),
      paymentBreakdown,
      cashierAudits,
    };
  }

  /**
   * Generates Product Margin & Profitability report.
   */
  async getProductProfitabilityReport(
    branchId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ProductProfitabilityReport> {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate
      ? new Date(endDate)
      : new Date();

    const res = await this.db.query<any>(
      `SELECT
         si.product_id,
         p.sku,
         p.name_en,
         COALESCE(SUM(si.quantity), 0) as quantity_sold,
         COALESCE(SUM(si.unit_price * si.quantity), 0) as gross_revenue,
         COALESCE(SUM(si.discount_amount), 0) as discount_amount,
         COALESCE(SUM(si.line_total), 0) as net_revenue,
         COALESCE(SUM(si.unit_cost * si.quantity), 0) as cogs
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE s.branch_id = $1
         AND s.created_at >= $2
         AND s.created_at <= $3
         AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
       GROUP BY si.product_id, p.sku, p.name_en
       ORDER BY net_revenue DESC`,
      [branchId, start, end],
    );

    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalGrossProfit = 0;

    const items: ProductProfitabilityItem[] = res.rows.map((r: any) => {
      const netRev = parseFloat(r.net_revenue);
      const cogs = parseFloat(r.cogs);
      const grossProfit = netRev - cogs;
      const marginPercentage = netRev > 0 ? (grossProfit / netRev) * 100 : 0;

      totalRevenue += netRev;
      totalCOGS += cogs;
      totalGrossProfit += grossProfit;

      const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      return {
        productId: r.product_id,
        sku: r.sku,
        nameEn: r.name_en,
        quantitySold: parseFloat(r.quantity_sold),
        grossRevenue: r2(parseFloat(r.gross_revenue)),
        discountAmount: r2(parseFloat(r.discount_amount)),
        netRevenue: r2(netRev),
        cogs: r2(cogs),
        grossProfit: r2(grossProfit),
        marginPercentage: r2(marginPercentage),
      };
    });

    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const overallMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

    return {
      branchId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalRevenue: r2(totalRevenue),
      totalCOGS: r2(totalCOGS),
      totalGrossProfit: r2(totalGrossProfit),
      overallMarginPercentage: r2(overallMargin),
      items,
    };
  }

  /**
   * Generates Current Stock Valuation report grouped by product category.
   */
  async getStockValuationReport(branchId: string): Promise<StockValuationReport> {
    const res = await this.db.query<any>(
      `WITH latest_ledger AS (
         SELECT DISTINCT ON (product_id) product_id, balance_after
         FROM stock_ledger
         WHERE branch_id = $1
         ORDER BY product_id, created_at DESC, id DESC
       )
       SELECT
         c.id as category_id,
         c.name_en as category_name,
         p.id as product_id,
         p.cost_price,
         COALESCE(bpo.min_stock_level, p.min_stock_level) as min_stock,
         COALESCE(l.balance_after, 0) as quantity_on_hand
       FROM products p
       JOIN categories c ON p.category_id = c.id
       LEFT JOIN latest_ledger l ON p.id = l.product_id
       LEFT JOIN branch_product_overrides bpo ON p.id = bpo.product_id AND bpo.branch_id = $1
       WHERE p.is_active = TRUE`,
      [branchId],
    );

    const categoryMap = new Map<string, CategoryValuationSummary>();
    let grandTotalProducts = 0;
    let grandTotalQuantity = 0;
    let grandTotalValuation = 0;
    let lowStockCount = 0;

    for (const row of res.rows) {
      const catId = row.category_id;
      const catName = row.category_name;
      const qty = Math.max(0, parseFloat(row.quantity_on_hand));
      const cost = parseFloat(row.cost_price);
      const minStock = parseFloat(row.min_stock);
      const val = qty * cost;

      grandTotalProducts++;
      grandTotalQuantity += qty;
      grandTotalValuation += val;

      if (qty <= minStock) {
        lowStockCount++;
      }

      const existing = categoryMap.get(catId);
      if (existing) {
        existing.productCount++;
        existing.totalQuantity += qty;
        existing.totalValuation += val;
      } else {
        categoryMap.set(catId, {
          categoryId: catId,
          categoryName: catName,
          productCount: 1,
          totalQuantity: qty,
          totalValuation: val,
        });
      }
    }

    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    const categories: CategoryValuationSummary[] = Array.from(categoryMap.values()).map((c) => ({
      ...c,
      totalQuantity: r2(c.totalQuantity),
      totalValuation: r2(c.totalValuation),
    }));

    return {
      branchId,
      generatedAt: new Date().toISOString(),
      totalProducts: grandTotalProducts,
      totalQuantityOnHand: r2(grandTotalQuantity),
      totalValuationETB: r2(grandTotalValuation),
      lowStockItemsCount: lowStockCount,
      categories,
    };
  }

  /**
   * Generates Expiring & Perishable Batches report.
   */
  async getExpiringStockReport(
    branchId: string,
    thresholdDays = 30,
  ): Promise<ExpiringStockReport> {
    const res = await this.db.query<any>(
      `SELECT
         b.id as batch_id,
         b.batch_number,
         b.product_id,
         p.name_en as product_name,
         b.expiry_date,
         b.current_quantity,
         b.unit_cost,
         (b.expiry_date - CURRENT_DATE) as days_until_expiry
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.branch_id = $1
         AND b.current_quantity > 0
         AND b.expiry_date IS NOT NULL
         AND b.expiry_date <= (CURRENT_DATE + ($2 || ' days')::interval)
       ORDER BY b.expiry_date ASC`,
      [branchId, thresholdDays],
    );

    let totalExpiringValue = 0;
    let alreadyExpiredValue = 0;

    const batches: ExpiringBatchItem[] = res.rows.map((r: any) => {
      const qty = parseFloat(r.current_quantity);
      const unitCost = parseFloat(r.unit_cost);
      const days = parseInt(r.days_until_expiry, 10);
      const lossVal = qty * unitCost;
      const isExpired = days <= 0;

      if (isExpired) {
        alreadyExpiredValue += lossVal;
      } else {
        totalExpiringValue += lossVal;
      }

      const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      return {
        batchId: r.batch_id,
        batchNumber: r.batch_number,
        productId: r.product_id,
        productName: r.product_name,
        expiryDate: r.expiry_date.toISOString().split('T')[0],
        daysUntilExpiry: days,
        quantityOnHand: qty,
        unitCost: r2(unitCost),
        potentialLossValue: r2(lossVal),
        isExpired,
      };
    });

    const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    return {
      branchId,
      thresholdDays,
      generatedAt: new Date().toISOString(),
      totalExpiringBatches: batches.length,
      totalExpiringValueETB: r2(totalExpiringValue),
      alreadyExpiredValueETB: r2(alreadyExpiredValue),
      batches,
    };
  }
}
