import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ReportFilterDto } from './dto/reports.dto';

export type FreshnessStatus = 'LIVE' | 'DELAYED' | 'STALE' | 'OFFLINE';

export interface BranchFreshnessInfo {
  branchId: string;
  branchCode: string;
  branchName: string;
  lastSyncedAt: Date | null;
  minutesSinceSync: number | null;
  freshness: FreshnessStatus;
  freshnessWarning?: string;
  todaySales: number;
  todayTransactions: number;
  stockValuationAtCost: number;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Classifies data freshness based on sync latency.
   */
  public classifyFreshness(lastSyncedAt: Date | null): {
    freshness: FreshnessStatus;
    minutesSinceSync: number | null;
    warning?: string;
  } {
    if (!lastSyncedAt) {
      return {
        freshness: 'OFFLINE',
        minutesSinceSync: null,
        warning: 'Branch has never synced with Central HQ.',
      };
    }

    const diffMinutes = Math.floor(
      (Date.now() - new Date(lastSyncedAt).getTime()) / (60 * 1000),
    );

    if (diffMinutes <= 15) {
      return { freshness: 'LIVE', minutesSinceSync: diffMinutes };
    }
    if (diffMinutes <= 60) {
      return {
        freshness: 'DELAYED',
        minutesSinceSync: diffMinutes,
        warning: `Data is ${diffMinutes} minutes delayed.`,
      };
    }
    if (diffMinutes <= 1440) {
      return {
        freshness: 'STALE',
        minutesSinceSync: diffMinutes,
        warning: `Data is stale (${Math.floor(diffMinutes / 60)} hours since last sync).`,
      };
    }

    return {
      freshness: 'OFFLINE',
      minutesSinceSync: diffMinutes,
      warning: `BRANCH OFFLINE (${Math.floor(diffMinutes / 1440)} days since last sync). Data is not current.`,
    };
  }

  /**
   * Branch Offline / HQ Sales Summary.
   */
  async getSalesSummary(filter: ReportFilterDto) {
    let query = `
      SELECT 
        COUNT(s.id) as total_transactions,
        COALESCE(SUM(s.subtotal), 0) as gross_subtotal,
        COALESCE(SUM(s.discount_total), 0) as total_discounts,
        COALESCE(SUM(s.taxable_subtotal), 0) as taxable_subtotal_15,
        COALESCE(SUM(s.tax_total), 0) as vat_15_collected,
        COALESCE(SUM(s.tax_exempt_subtotal), 0) as tax_exempt_subtotal,
        COALESCE(SUM(s.grand_total), 0) as net_sales_revenue
      FROM sales s
      WHERE s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
    `;
    const params: any[] = [];

    if (filter.branch_id) {
      params.push(filter.branch_id);
      query += ` AND s.branch_id = $${params.length}`;
    }
    if (filter.start_date) {
      params.push(filter.start_date);
      query += ` AND s.created_at >= $${params.length}::timestamptz`;
    }
    if (filter.end_date) {
      params.push(filter.end_date);
      query += ` AND s.created_at <= ($${params.length}::date + interval '1 day')::timestamptz`;
    }

    const summaryRes = await this.db.query(query, params);
    const summary = summaryRes.rows[0];

    // Payment methods breakdown
    let pQuery = `
      SELECT p.payment_method, COALESCE(SUM(p.amount), 0) as total_amount, COUNT(p.id) as payment_count
      FROM sale_payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
    `;
    const pParams: any[] = [];
    if (filter.branch_id) {
      pParams.push(filter.branch_id);
      pQuery += ` AND s.branch_id = $${pParams.length}`;
    }
    if (filter.start_date) {
      pParams.push(filter.start_date);
      pQuery += ` AND s.created_at >= $${pParams.length}::timestamptz`;
    }
    if (filter.end_date) {
      pParams.push(filter.end_date);
      pQuery += ` AND s.created_at <= ($${pParams.length}::date + interval '1 day')::timestamptz`;
    }
    pQuery += ` GROUP BY p.payment_method ORDER BY total_amount DESC`;

    const paymentRes = await this.db.query(pQuery, pParams);

    return {
      total_transactions: parseInt(summary.total_transactions, 10),
      gross_subtotal: parseFloat(summary.gross_subtotal),
      total_discounts: parseFloat(summary.total_discounts),
      taxable_subtotal_15: parseFloat(summary.taxable_subtotal_15),
      vat_15_collected: parseFloat(summary.vat_15_collected),
      tax_exempt_subtotal: parseFloat(summary.tax_exempt_subtotal),
      net_sales_revenue: parseFloat(summary.net_sales_revenue),
      payment_breakdown: paymentRes.rows.map((r) => ({
        payment_method: r.payment_method,
        total_amount: parseFloat(r.total_amount),
        count: parseInt(r.payment_count, 10),
      })),
    };
  }

  /**
   * Gross Profit & Margin Report (Revenue vs COGS from actual sale snapshots).
   */
  async getProfitAndMarginReport(filter: ReportFilterDto) {
    let query = `
      SELECT 
        c.name_en as category_name,
        p.id as product_id,
        p.sku,
        p.name_en as product_name,
        SUM(si.quantity) as total_quantity_sold,
        SUM(si.line_total) as total_revenue,
        SUM(si.quantity * si.unit_cost) as total_cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      JOIN categories c ON c.id = p.category_id
      WHERE s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
    `;
    const params: any[] = [];

    if (filter.branch_id) {
      params.push(filter.branch_id);
      query += ` AND s.branch_id = $${params.length}`;
    }
    if (filter.start_date) {
      params.push(filter.start_date);
      query += ` AND s.created_at >= $${params.length}::timestamptz`;
    }
    if (filter.end_date) {
      params.push(filter.end_date);
      query += ` AND s.created_at <= ($${params.length}::date + interval '1 day')::timestamptz`;
    }

    query += `
      GROUP BY c.name_en, p.id, p.sku, p.name_en
      ORDER BY total_revenue DESC
    `;

    const res = await this.db.query(query, params);

    let networkRevenue = 0;
    let networkCogs = 0;

    const items = res.rows.map((row) => {
      const revenue = parseFloat(row.total_revenue);
      const cogs = parseFloat(row.total_cogs);
      const grossProfit = Number((revenue - cogs).toFixed(4));
      const marginPct = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0;

      networkRevenue += revenue;
      networkCogs += cogs;

      return {
        category_name: row.category_name,
        product_id: row.product_id,
        sku: row.sku,
        product_name: row.product_name,
        quantity_sold: parseFloat(row.total_quantity_sold),
        revenue,
        cogs,
        gross_profit: grossProfit,
        margin_percentage: marginPct,
      };
    });

    const totalProfit = Number((networkRevenue - networkCogs).toFixed(4));
    const overallMargin = networkRevenue > 0 ? Number(((totalProfit / networkRevenue) * 100).toFixed(2)) : 0;

    return {
      total_revenue: networkRevenue,
      total_cogs: networkCogs,
      total_gross_profit: totalProfit,
      overall_margin_percentage: overallMargin,
      product_breakdown: items,
    };
  }

  /**
   * Real-time Inventory Valuation Report at Weighted Average Cost vs Retail Selling Price.
   */
  async getStockValuationReport(branchId?: string) {
    let query = `
      SELECT 
        b.branch_id,
        br.name as branch_name,
        c.name_en as category_name,
        p.id as product_id,
        p.sku,
        p.name_en as product_name,
        p.uom_code,
        SUM(b.current_quantity) as total_on_hand,
        SUM(b.current_quantity * b.unit_cost) as total_valuation_at_cost,
        SUM(b.current_quantity * COALESCE(o.selling_price, p.base_price)) as potential_retail_value
      FROM batches b
      JOIN products p ON p.id = b.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN branches br ON br.id = b.branch_id
      LEFT JOIN branch_product_overrides o ON o.product_id = p.id AND o.branch_id = b.branch_id AND o.is_active = TRUE
      WHERE b.current_quantity > 0
    `;
    const params: any[] = [];
    if (branchId) {
      params.push(branchId);
      query += ` AND b.branch_id = $1`;
    }
    query += `
      GROUP BY b.branch_id, br.name, c.name_en, p.id, p.sku, p.name_en, p.uom_code
      ORDER BY total_valuation_at_cost DESC
    `;

    const res = await this.db.query(query, params);

    let totalValuationCost = 0;
    let totalPotentialRetail = 0;

    const items = res.rows.map((r) => {
      const costVal = parseFloat(r.total_valuation_at_cost);
      const retailVal = parseFloat(r.potential_retail_value);
      totalValuationCost += costVal;
      totalPotentialRetail += retailVal;

      return {
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        category: r.category_name,
        sku: r.sku,
        product_name: r.product_name,
        uom: r.uom_code,
        on_hand: parseFloat(r.total_on_hand),
        valuation_at_cost: Number(costVal.toFixed(2)),
        potential_retail_value: Number(retailVal.toFixed(2)),
        potential_gross_margin: Number((retailVal - costVal).toFixed(2)),
      };
    });

    return {
      total_valuation_at_cost: Number(totalValuationCost.toFixed(2)),
      total_potential_retail_value: Number(totalPotentialRetail.toFixed(2)),
      total_potential_margin: Number((totalPotentialRetail - totalValuationCost).toFixed(2)),
      items,
    };
  }

  /**
   * Cashier Performance & Drawer Reconciliation Audit Report.
   */
  async getCashierPerformanceReport(filter: ReportFilterDto) {
    let query = `
      SELECT 
        u.id as cashier_id,
        u.full_name as cashier_name,
        COUNT(DISTINCT sh.id) as shifts_worked,
        COUNT(s.id) as transactions_processed,
        COALESCE(SUM(s.grand_total), 0) as total_sales_volume,
        COALESCE(AVG(s.grand_total), 0) as avg_basket_size,
        COALESCE(SUM(sh.cash_variance), 0) as total_cash_variance
      FROM users u
      LEFT JOIN shifts sh ON sh.cashier_id = u.id AND sh.status = 'CLOSED'
      LEFT JOIN sales s ON s.cashier_id = u.id AND s.payment_status = 'PAID'
      WHERE u.is_active = TRUE
    `;
    const params: any[] = [];
    if (filter.branch_id) {
      params.push(filter.branch_id);
      query += ` AND sh.branch_id = $${params.length}`;
    }
    query += `
      GROUP BY u.id, u.full_name
      ORDER BY total_sales_volume DESC
    `;

    const res = await this.db.query(query, params);
    return res.rows.map((r) => ({
      cashier_id: r.cashier_id,
      cashier_name: r.cashier_name,
      shifts_worked: parseInt(r.shifts_worked, 10),
      transactions_processed: parseInt(r.transactions_processed, 10),
      total_sales_volume: parseFloat(r.total_sales_volume),
      avg_basket_size: parseFloat(r.avg_basket_size),
      total_cash_variance: parseFloat(r.total_cash_variance),
    }));
  }

  /**
   * Central HQ Consolidated Multi-Branch Dashboard with Live Freshness Indicators.
   */
  async getConsolidatedHqDashboard(): Promise<{
    consolidatedRevenue: number;
    consolidatedTransactions: number;
    consolidatedStockValuation: number;
    branches: BranchFreshnessInfo[];
  }> {
    const branchesRes = await this.db.query(
      `SELECT id, code, name FROM branches WHERE is_active = TRUE AND is_hq = FALSE ORDER BY name ASC`,
    );

    let totalRevenue = 0;
    let totalTransactions = 0;
    let totalStockVal = 0;
    const branchInfos: BranchFreshnessInfo[] = [];

    for (const b of branchesRes.rows) {
      // 1. Freshness Check
      const checkpoint = await this.db.query<{ last_synced_at: Date }>(
        `SELECT last_synced_at FROM sync_checkpoints WHERE branch_id = $1 AND stream_name = 'BRANCH_TO_HQ'`,
        [b.id],
      );
      const lastSync = checkpoint.rowCount ? checkpoint.rows[0].last_synced_at : null;
      const freshnessData = this.classifyFreshness(lastSync);

      // 2. Today's Sales
      const todayRes = await this.db.query<{
        sales: string;
        count: string;
      }>(
        `SELECT 
           COALESCE(SUM(grand_total), 0) as sales,
           COUNT(*) as count
         FROM sales
         WHERE branch_id = $1 AND created_at >= CURRENT_DATE::timestamptz`,
        [b.id],
      );
      const sales = parseFloat(todayRes.rows[0]?.sales || '0');
      const count = parseInt(todayRes.rows[0]?.count || '0', 10);

      // 3. Stock Valuation
      const valRes = await this.db.query<{ total_val: string }>(
        `SELECT COALESCE(SUM(current_quantity * unit_cost), 0) as total_val
         FROM batches
         WHERE branch_id = $1 AND current_quantity > 0`,
        [b.id],
      );
      const stockVal = parseFloat(valRes.rows[0]?.total_val || '0');

      totalRevenue += sales;
      totalTransactions += count;
      totalStockVal += stockVal;

      branchInfos.push({
        branchId: b.id,
        branchCode: b.code,
        branchName: b.name,
        lastSyncedAt: lastSync,
        minutesSinceSync: freshnessData.minutesSinceSync,
        freshness: freshnessData.freshness,
        freshnessWarning: freshnessData.warning,
        todaySales: Number(sales.toFixed(2)),
        todayTransactions: count,
        stockValuationAtCost: Number(stockVal.toFixed(2)),
      });
    }

    return {
      consolidatedRevenue: Number(totalRevenue.toFixed(2)),
      consolidatedTransactions: totalTransactions,
      consolidatedStockValuation: Number(totalStockVal.toFixed(2)),
      branches: branchInfos,
    };
  }

  /**
   * Formats tabular report rows into CSV string.
   */
  public generateCsv(headers: string[], rows: (string | number)[][]): string {
    const escapeCsv = (val: string | number) => {
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map(escapeCsv).join(',');
    const dataLines = rows.map((r) => r.map(escapeCsv).join(','));

    return [headerLine, ...dataLines].join('\n');
  }
}
