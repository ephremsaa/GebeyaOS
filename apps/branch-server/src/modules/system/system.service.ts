import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import {
  AuditLogQueryDto,
  CreateAuditLogDto,
  UpdateSystemSettingDto,
  RestoreBackupDto,
} from './system.dto';
import { generateUuidV7 } from '@gebeyaos/shared-types';

export interface DashboardSummary {
  todaySales: {
    grossSales: number;
    netSales: number;
    transactionCount: number;
    cashCollected: number;
    digitalCollected: number;
    taxTotal: number;
  };
  inventorySummary: {
    totalActiveProducts: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringBatchesCount: number;
  };
  syncStatus: {
    pendingOutboxCount: number;
    lastSyncTime: string | null;
    isOnline: boolean;
  };
  cashDrawer: {
    estimatedCashOnHand: number;
    thresholdAlert: boolean;
    maxThreshold: number;
  };
  recentSales?: Array<{
    id: string;
    receiptNumber: string;
    cashierName: string;
    grandTotal: number;
    paymentStatus: string;
    createdAt: string;
  }>;
  weeklyTrend?: {
    thisWeek: Array<{ day: string; amount: number; count: number }>;
    lastWeek: Array<{ day: string; amount: number; count: number }>;
    growthPercentage: number;
  };
  salesByCategory?: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
  alerts?: Array<{
    id: string;
    productId: string;
    productName: string;
    sku: string;
    type: 'LOW_STOCK' | 'EXPIRING' | 'OUT_OF_STOCK';
    severity: 'WARNING' | 'DANGER';
    currentStock: number;
    uom: string;
    expiryDate?: string | null;
  }>;
  kpis?: {
    salesGrowthPercent: number;
    ordersGrowthPercent: number;
  };
}

export interface NotificationItem {
  id: string;
  type: 'STOCKOUT' | 'LOW_STOCK' | 'EXPIRY' | 'SYNC' | 'CASH_THRESHOLD';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  timestamp: string;
  actionUrl?: string;
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Aggregates real-time KPIs for the Home Dashboard.
   */
  async getDashboardSummary(branchId: string): Promise<DashboardSummary> {
    const isAllBranches =
      !branchId ||
      branchId.toUpperCase() === 'ALL' ||
      branchId === '00000000-0000-0000-0000-000000000001';

    // Addis Ababa (UTC+3) business day midnight: 00:00:00 EAT corresponds to 21:00:00 UTC previous day
    const now = new Date();
    const eatOffsetMs = 3 * 60 * 60 * 1000;
    const addisNow = new Date(now.getTime() + eatOffsetMs);
    const year = addisNow.getUTCFullYear();
    const month = addisNow.getUTCMonth();
    const date = addisNow.getUTCDate();
    const todayMidnight = new Date(Date.UTC(year, month, date, -3, 0, 0, 0));

    // 1. Sales totals for today
    const salesRes = await this.db.query(
      `SELECT
         COALESCE(SUM(grand_total), 0) as gross_sales,
         COALESCE(SUM(taxable_subtotal), 0) as net_sales,
         COUNT(id) as transaction_count,
         COALESCE(SUM(tax_total), 0) as tax_total
       FROM sales
       WHERE ${isAllBranches ? '1=1' : 'branch_id = $1'}
         AND created_at >= ${isAllBranches ? '$1' : '$2'}
         AND payment_status IN ('PAID', 'PARTIALLY_REFUNDED')`,
      isAllBranches ? [todayMidnight.toISOString()] : [branchId, todayMidnight.toISOString()],
    );
    const sRow = salesRes.rows[0] || {};

    // 2. Payments breakdown (Cash vs Digital)
    const paymentsRes = await this.db.query(
      `SELECT
         sp.payment_method,
         COALESCE(SUM(sp.amount), 0) as total_amount
       FROM sale_payments sp
       JOIN sales s ON sp.sale_id = s.id
       WHERE ${isAllBranches ? '1=1' : 's.branch_id = $1'}
         AND s.created_at >= ${isAllBranches ? '$1' : '$2'}
         AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
       GROUP BY sp.payment_method`,
      isAllBranches ? [todayMidnight.toISOString()] : [branchId, todayMidnight.toISOString()],
    );

    let cashCollected = 0;
    let digitalCollected = 0;
    for (const p of paymentsRes.rows) {
      const amount = parseFloat(p.total_amount) || 0;
      if (p.payment_method === 'CASH') {
        cashCollected += amount;
      } else {
        digitalCollected += amount;
      }
    }

    // 3. Inventory Stock Counts
    const productsRes = await this.db.query(
      `SELECT
         COUNT(p.id) as total_active,
         COUNT(p.id) FILTER (WHERE COALESCE(stock.soh, 0) <= p.min_stock_level AND COALESCE(stock.soh, 0) > 0) as low_stock,
         COUNT(p.id) FILTER (WHERE COALESCE(stock.soh, 0) <= 0) as out_of_stock
       FROM products p
       LEFT JOIN (
         SELECT product_id, SUM(quantity_change) as soh
         FROM stock_ledger
         WHERE ${isAllBranches ? '1=1' : 'branch_id = $1'}
         GROUP BY product_id
       ) stock ON p.id = stock.product_id
       WHERE p.is_active = TRUE`,
      isAllBranches ? [] : [branchId],
    );
    const pRow = productsRes.rows[0] || {};

    // 4. Expiring Batches (within next 30 days)
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const expiringRes = await this.db.query(
      `SELECT COUNT(id) as count
       FROM batches
       WHERE ${isAllBranches ? '1=1' : 'branch_id = $1'}
         AND expiry_date IS NOT NULL
         AND expiry_date <= ${isAllBranches ? '$1' : '$2'}
         AND current_quantity > 0`,
      isAllBranches ? [in30Days.toISOString().slice(0, 10)] : [branchId, in30Days.toISOString().slice(0, 10)],
    );
    const expiringCount = parseInt(expiringRes.rows[0]?.count || '0', 10);

    // 5. Sync outbox pending count
    const syncRes = await this.db.query(
      `SELECT COUNT(id) as pending_count FROM sync_outbox WHERE status = 'PENDING'`,
    );
    const pendingOutbox = parseInt(syncRes.rows[0]?.pending_count || '0', 10);

    // 6. Cash drawer threshold check
    const maxThreshold = 50000; // 50,000 ETB default safe threshold
    const thresholdAlert = cashCollected >= maxThreshold;

    // 7. Recent Sales
    let recentSales: any[] = [];
    try {
      const recentSalesRes = await this.db.query(
        `SELECT s.id, s.receipt_number, s.grand_total, s.payment_status, s.created_at,
                COALESCE(u.full_name, 'Cashier') as cashier_name
         FROM sales s
         LEFT JOIN users u ON s.cashier_id = u.id
         WHERE ${isAllBranches ? '1=1' : 's.branch_id = $1'}
         ORDER BY s.created_at DESC
         LIMIT 6`,
        isAllBranches ? [] : [branchId],
      );
      recentSales = recentSalesRes.rows.map((r: any) => ({
        id: r.id,
        receiptNumber: r.receipt_number,
        cashierName: r.cashier_name,
        grandTotal: parseFloat(r.grand_total) || 0,
        paymentStatus: r.payment_status,
        createdAt: r.created_at,
      }));
    } catch (e) {
      this.logger.warn(`Failed to fetch recent sales for dashboard: ${e}`);
    }

    // 8. Sales by Category
    let salesByCategory: any[] = [];
    try {
      const catRes = await this.db.query(
        `SELECT c.id, c.name_en, COALESCE(SUM(si.line_total), 0) as total
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
         LEFT JOIN sale_items si ON si.product_id = p.id
         GROUP BY c.id, c.name_en
         ORDER BY total DESC
         LIMIT 5`,
      );
      const totalCatRevenue = catRes.rows.reduce(
        (sum: number, r: any) => sum + (parseFloat(r.total) || 0),
        0,
      );
      salesByCategory = catRes.rows.map((r: any) => {
        const amt = parseFloat(r.total) || 0;
        return {
          categoryId: r.id,
          categoryName: r.name_en || 'General',
          amount: amt,
          percentage: totalCatRevenue > 0 ? Math.round((amt / totalCatRevenue) * 100) : 0,
        };
      });
    } catch (e) {
      this.logger.warn(`Failed to fetch category sales for dashboard: ${e}`);
    }

    // 9. Stock & Expiry Alerts
    let alerts: any[] = [];
    try {
      const alertsRes = await this.db.query(
        `SELECT p.id, p.name_en, p.sku, p.uom_code, p.min_stock_level,
                COALESCE(stock.soh, 0) as current_stock
         FROM products p
         LEFT JOIN (
           SELECT product_id, SUM(quantity_change) as soh
           FROM stock_ledger
           WHERE ${isAllBranches ? '1=1' : 'branch_id = $1'}
           GROUP BY product_id
         ) stock ON p.id = stock.product_id
         WHERE p.is_active = TRUE
           AND (COALESCE(stock.soh, 0) <= p.min_stock_level)
         ORDER BY current_stock ASC
         LIMIT 6`,
        isAllBranches ? [] : [branchId],
      );
      alerts = alertsRes.rows.map((r: any) => {
        const stockVal = parseFloat(r.current_stock) || 0;
        const isOut = stockVal <= 0;
        return {
          id: r.id,
          productId: r.id,
          productName: r.name_en,
          sku: r.sku || 'SKU',
          type: isOut ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          severity: isOut ? 'DANGER' : 'WARNING',
          currentStock: stockVal,
          uom: r.uom_code || 'PCS',
          expiryDate: null,
        };
      });
    } catch (e) {
      this.logger.warn(`Failed to fetch inventory alerts for dashboard: ${e}`);
    }

    // 10. Weekly Trend & Growth
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const thisWeek = dayNames.map((d) => ({ day: d, amount: 0, count: 0 }));
    const lastWeek = dayNames.map((d) => ({ day: d, amount: 0, count: 0 }));

    try {
      const sevenDaysAgo = new Date(todayMidnight.getTime() - 6 * 24 * 60 * 60 * 1000);
      const trendRes = await this.db.query(
        `SELECT
           EXTRACT(DOW FROM (created_at AT TIME ZONE 'Africa/Addis_Ababa')) as dow,
           COALESCE(SUM(grand_total), 0) as total_amount,
           COUNT(id) as count
         FROM sales
         WHERE ${isAllBranches ? '1=1' : 'branch_id = $1'}
           AND created_at >= ${isAllBranches ? '$1' : '$2'}
           AND payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
         GROUP BY dow`,
        isAllBranches ? [sevenDaysAgo.toISOString()] : [branchId, sevenDaysAgo.toISOString()],
      );
      // DOW: 0=Sun, 1=Mon, ..., 6=Sat
      const dowToIdx: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
      for (const row of trendRes.rows) {
        const dow = parseInt(row.dow, 10);
        const idx = dowToIdx[dow];
        if (idx !== undefined && thisWeek[idx]) {
          thisWeek[idx].amount = parseFloat(row.total_amount) || 0;
          thisWeek[idx].count = parseInt(row.count, 10) || 0;
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to calculate weekly trend: ${e}`);
    }

    return {
      todaySales: {
        grossSales: parseFloat(sRow.gross_sales) || 0,
        netSales: parseFloat(sRow.net_sales) || 0,
        transactionCount: parseInt(sRow.transaction_count, 10) || 0,
        cashCollected,
        digitalCollected,
        taxTotal: parseFloat(sRow.tax_total) || 0,
      },
      inventorySummary: {
        totalActiveProducts: parseInt(pRow.total_active, 10) || 0,
        lowStockCount: parseInt(pRow.low_stock, 10) || 0,
        outOfStockCount: parseInt(pRow.out_of_stock, 10) || 0,
        expiringBatchesCount: expiringCount,
      },
      syncStatus: {
        pendingOutboxCount: pendingOutbox,
        lastSyncTime: new Date().toISOString(),
        isOnline: true, // LAN server active
      },
      cashDrawer: {
        estimatedCashOnHand: cashCollected,
        thresholdAlert,
        maxThreshold,
      },
      recentSales,
      weeklyTrend: {
        thisWeek,
        lastWeek,
        growthPercentage: 0,
      },
      salesByCategory,
      alerts,
      kpis: {
        salesGrowthPercent: 0,
        ordersGrowthPercent: 0,
      },
    };
  }

  /**
   * Retrieves all system settings or a specific category.
   */
  async getSettings(branchId?: string): Promise<Record<string, any>> {
    const res = await this.db.query<{ key: string; value: any }>(
      `SELECT key, value FROM system_settings`,
    );

    const settingsMap: Record<string, any> = {};
    for (const row of res.rows) {
      settingsMap[row.key] = row.value;
    }

    // Overlay general_config if present so all sub-sections are available
    if (settingsMap['general_config']) {
      const gc = settingsMap['general_config'];
      if (gc.store_info) settingsMap['store_info'] = { ...(settingsMap['store_info'] || {}), ...gc.store_info };
      if (gc.receipt_config) settingsMap['receipt_config'] = { ...(settingsMap['receipt_config'] || {}), ...gc.receipt_config };
      if (gc.sales_config) settingsMap['sales_config'] = { ...(settingsMap['sales_config'] || {}), ...gc.sales_config };
      if (gc.stock_config) settingsMap['stock_config'] = { ...(settingsMap['stock_config'] || {}), ...gc.stock_config };
    }

    const isAll = !branchId || branchId.toUpperCase() === 'ALL' || branchId === '00000000-0000-0000-0000-000000000001';
    const bId = isAll ? '01a19309-1d43-7444-b260-5b2ffac3e40c' : branchId;
    const branchRes = await this.db.query<any>(
      `SELECT b.id, b.code, b.name, b.trade_name, b.tin_number, b.vat_registration_no, b.phone,
              COALESCE(b.city, '') || CASE WHEN b.subcity IS NOT NULL THEN ', ' || b.subcity ELSE '' END as address,
              t.name as tenant_name, t.logo_url, t.receipt_header, t.vat_settings
       FROM branches b
       LEFT JOIN tenants t ON b.tenant_id = t.id
       WHERE b.id = $1 LIMIT 1`,
      [bId],
    );
    const branch = branchRes.rows[0];

    // Default fallbacks prioritizing real branch details
    if (!settingsMap['store_info']) {
      settingsMap['store_info'] = {
        name: branch?.trade_name || branch?.tenant_name || branch?.name || 'Gebeya Supermarket',
        branchName: branch?.name || 'Bole Medhanialem',
        code: branch?.code || 'BOLE-01',
        tradeName: branch?.trade_name || branch?.tenant_name || 'Gebeya Retail PLC',
        tinNumber: branch?.tin_number || '0012345678',
        vatNumber: branch?.vat_registration_no || 'VAT-ET-9921',
        phone: branch?.phone || '+251 11 661 2233',
        address: branch?.address || 'Ethiopia , Addis Ababa',
        brandColor: '#1F8A4C',
        currency: 'ETB',
        vatRate: 0.15,
      };
    } else if (branch) {
      if (!settingsMap['store_info'].code && branch.code) settingsMap['store_info'].code = branch.code;
      if (!settingsMap['store_info'].name && branch.trade_name) settingsMap['store_info'].name = branch.trade_name;
      if (!settingsMap['store_info'].branchName && branch.name) settingsMap['store_info'].branchName = branch.name;
      if (!settingsMap['store_info'].tinNumber && branch.tin_number) settingsMap['store_info'].tinNumber = branch.tin_number;
      if (!settingsMap['store_info'].vatNumber && branch.vat_registration_no) settingsMap['store_info'].vatNumber = branch.vat_registration_no;
      if (!settingsMap['store_info'].phone && branch.phone) settingsMap['store_info'].phone = branch.phone;
      if (!settingsMap['store_info'].address && branch.address) settingsMap['store_info'].address = branch.address;
    }

    if (!settingsMap['receipt_config']) {
      settingsMap['receipt_config'] = {
        headerText: branch?.receipt_header || `እንኳን ደህና መጡ! / Welcome to ${branch?.trade_name || branch?.name || 'Gebeya Supermarket'}`,
        footerText: 'ዕቃዎች ከተገዙበት ቀን ጀምሮ በ3 ቀናት ውስጥ በደረሰኝ ይመለሳሉ።\nGoods exchangeable within 3 days with receipt.\nTHANK YOU FOR SHOPPING WITH US!',
        returnPolicyNote: 'Items exchangeable within 3 days with valid receipt.',
        taxInvoiceTitle: 'OFFICIAL CASH SALES INVOICE',
        showCashierName: true,
        showTinVat: true,
      };
    }
    if (!settingsMap['sales_config']) {
      settingsMap['sales_config'] = {
        defaultPayment: 'CASH',
        allowCreditSales: false,
        maxDiscountNoPin: 10,
        standardVatRate: 15,
        returnPolicyNote: 'Items exchangeable within 3 days with valid receipt.',
      };
    }
    if (!settingsMap['stock_config']) {
      settingsMap['stock_config'] = {
        lowStockThreshold: 5,
        expiryWarningDays: 90,
        expiryWarningUnit: 'months',
        expiryWarningValue: 3,
        expiryStep30Days: true,
        expiryStep7Days: true,
        categoryOverrides: [],
        emailSummaryEnabled: false,
        smsSummaryEnabled: false,
        allowNegativeStock: false,
      };
    }
    if (!settingsMap['financial_config']) {
      settingsMap['financial_config'] = {
        defaultCurrency: 'ETB',
        vatRate: 0.15,
        withholdingTaxRate: 0.02,
        cashDrawerLimit: 50000,
      };
    }
    if (!settingsMap['sync_config']) {
      settingsMap['sync_config'] = {
        hqUrl: 'http://hq.local:4000/api/sync',
        autoSyncIntervalSeconds: 30,
        offlineGracePeriodHours: 72,
      };
    }

    return settingsMap;
  }

  /**
   * Saves or updates a system setting key.
   */
  async saveSetting(dto: UpdateSystemSettingDto, userId?: string, branchId?: string): Promise<void> {
    const isAll = !branchId || branchId.toUpperCase() === 'ALL' || branchId === '00000000-0000-0000-0000-000000000001';
    const bId = isAll ? '01a19309-1d43-7444-b260-5b2ffac3e40c' : branchId;
    const tenantRes = await this.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM branches WHERE id = $1 UNION SELECT id as tenant_id FROM tenants LIMIT 1`,
      [bId],
    );
    const tenantId = tenantRes.rows[0]?.tenant_id || '01900000-0000-7000-8000-000000000001';

    // 1. Save the main setting key
    await this.db.query(
      `INSERT INTO system_settings (tenant_id, key, value, updated_at)
       VALUES ($1, $2, $3, clock_timestamp())
       ON CONFLICT (tenant_id, key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
      [tenantId, dto.key, JSON.stringify(dto.value)],
    );

    // Extract sub-configs if payload is general_config
    const storeInfo = dto.key === 'general_config' ? dto.value?.store_info : (dto.key === 'store_info' ? dto.value : null);
    const receiptConfig = dto.key === 'general_config' ? dto.value?.receipt_config : (dto.key === 'receipt_config' ? dto.value : null);
    const salesConfig = dto.key === 'general_config' ? dto.value?.sales_config : (dto.key === 'sales_config' ? dto.value : null);
    const stockConfig = dto.key === 'general_config' ? dto.value?.stock_config : (dto.key === 'stock_config' ? dto.value : null);

    // Upsert individual section rows in system_settings if general_config was provided
    if (dto.key === 'general_config') {
      if (storeInfo) {
        await this.db.query(
          `INSERT INTO system_settings (tenant_id, key, value, updated_at)
           VALUES ($1, 'store_info', $2, clock_timestamp())
           ON CONFLICT (tenant_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
          [tenantId, JSON.stringify(storeInfo)],
        );
      }
      if (receiptConfig) {
        await this.db.query(
          `INSERT INTO system_settings (tenant_id, key, value, updated_at)
           VALUES ($1, 'receipt_config', $2, clock_timestamp())
           ON CONFLICT (tenant_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
          [tenantId, JSON.stringify(receiptConfig)],
        );
      }
      if (salesConfig) {
        await this.db.query(
          `INSERT INTO system_settings (tenant_id, key, value, updated_at)
           VALUES ($1, 'sales_config', $2, clock_timestamp())
           ON CONFLICT (tenant_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
          [tenantId, JSON.stringify(salesConfig)],
        );
      }
      if (stockConfig) {
        await this.db.query(
          `INSERT INTO system_settings (tenant_id, key, value, updated_at)
           VALUES ($1, 'stock_config', $2, clock_timestamp())
           ON CONFLICT (tenant_id, key) DO UPDATE
           SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
          [tenantId, JSON.stringify(stockConfig)],
        );
      }
    }

    // 2. Sync live branch table if store_info changed
    if (storeInfo) {
      try {
        await this.db.query(
          `UPDATE branches SET
             name = COALESCE($1, name),
             trade_name = COALESCE($2, trade_name),
             tin_number = COALESCE($3, tin_number),
             vat_registration_no = COALESCE($4, vat_registration_no),
             phone = COALESCE($5, phone),
             code = COALESCE($6, code),
             city = COALESCE($7, city),
             settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{allow_negative_stock}', $8::jsonb),
             updated_at = clock_timestamp()
           WHERE id = $9`,
          [
            storeInfo.branchName || storeInfo.name || null,
            storeInfo.name || storeInfo.tradeName || null,
            storeInfo.tinNumber || null,
            storeInfo.vatNumber || null,
            storeInfo.phone || null,
            storeInfo.code || null,
            storeInfo.address || null,
            JSON.stringify(stockConfig?.allowNegativeStock ?? false),
            bId,
          ],
        );
      } catch (err: any) {
        this.logger.warn(`Could not sync branch row: ${err.message}`);
      }

      // 3. Sync live tenant row
      try {
        const vatSettings = {
          rate: salesConfig?.standardVatRate ? salesConfig.standardVatRate / 100 : 0.15,
          primaryColor: storeInfo.brandColor || '#1F8A4C',
        };
        await this.db.query(
          `UPDATE tenants SET
             name = COALESCE($1, name),
             logo_url = COALESCE($2, logo_url),
             receipt_header = COALESCE($3, receipt_header),
             vat_settings = $4,
             updated_at = clock_timestamp()
           WHERE id = $5`,
          [
            storeInfo.name || null,
            storeInfo.logoUrl || null,
            receiptConfig?.headerText || null,
            JSON.stringify(vatSettings),
            tenantId,
          ],
        );
      } catch (err: any) {
        this.logger.warn(`Could not sync tenant row: ${err.message}`);
      }
    }

    // Log setting change in audit log
    await this.logAction(
      {
        action: 'SETTINGS_UPDATE',
        entityName: 'system_settings',
        details: { key: dto.key, updatedBy: userId || 'system' },
      },
      bId,
      userId,
    );
  }

  /**
   * Queries immutable audit trail logs.
   */
  async getAuditLogs(query: AuditLogQueryDto): Promise<{ total: number; rows: any[] }> {
    let whereClauses = ['1=1'];
    const params: any[] = [];
    let idx = 1;

    if (query.startDate) {
      whereClauses.push(`a.created_at >= $${idx++}`);
      params.push(new Date(query.startDate));
    }
    if (query.endDate) {
      whereClauses.push(`a.created_at <= $${idx++}`);
      params.push(new Date(query.endDate));
    }
    if (query.action) {
      whereClauses.push(`a.action ILIKE $${idx++}`);
      params.push(`%${query.action}%`);
    }
    if (query.userId) {
      whereClauses.push(`a.user_id = $${idx++}`);
      params.push(query.userId);
    }
    if (query.entityName) {
      whereClauses.push(`a.entity_name ILIKE $${idx++}`);
      params.push(`%${query.entityName}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    // Total count
    const countRes = await this.db.query<{ count: string }>(
      `SELECT COUNT(a.id) as count FROM audit_logs a WHERE ${whereSql}`,
      params,
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const dataRes = await this.db.query(
      `SELECT
         a.id, a.branch_id, a.user_id, a.action, a.entity_name, a.entity_id,
         a.ip_address, a.details, a.created_at,
         u.full_name as user_name, u.username, r.name as user_role
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE ${whereSql}
       ORDER BY a.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    return { total, rows: dataRes.rows };
  }

  /**
   * Records an audit log entry.
   */
  async logAction(dto: CreateAuditLogDto, branchId?: string, userId?: string, ip?: string): Promise<void> {
    try {
      const id = generateUuidV7();
      await this.db.query(
        `INSERT INTO audit_logs (
           id, branch_id, user_id, action, entity_name, entity_id, ip_address, details
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          branchId || null,
          userId || null,
          dto.action,
          dto.entityName,
          dto.entityId || null,
          ip || null,
          dto.details ? JSON.stringify(dto.details) : null,
        ],
      );
    } catch (err: any) {
      this.logger.error(`Failed to record audit log: ${err.message}`);
    }
  }

  /**
   * Gathers live notification alerts from notifications table, stockouts, and sync queue.
   */
  async getNotifications(branchId: string): Promise<any[]> {
    const notifications: any[] = [];

    // 1. Fetch active alerts from notifications table
    try {
      const dbNotifs = await this.db.query<any>(
        `SELECT n.id, n.type, n.stage, n.severity, n.title, n.title_am, n.message, n.message_am,
                n.action_url as "actionUrl", n.is_read as "isRead", n.created_at as "timestamp",
                n.batch_id as "batchId", n.product_id as "productId",
                b.batch_number as "batchNumber", b.expiry_date as "expiryDate",
                b.current_quantity as "currentQuantity", b.clearance_price as "clearancePrice",
                p.name_en as "productName", p.name_am as "productNameAm", p.photo_path as "photoPath", p.uom_code as "uomCode"
         FROM notifications n
         LEFT JOIN batches b ON n.batch_id = b.id
         LEFT JOIN products p ON n.product_id = p.id
         WHERE n.branch_id = $1
           AND n.dismissed = FALSE
           AND n.resolved = FALSE
           AND (n.snoozed_until IS NULL OR n.snoozed_until <= NOW())
         ORDER BY
           CASE n.severity WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
           n.created_at DESC
         LIMIT 50`,
        [branchId],
      );

      for (const row of dbNotifs.rows) {
        notifications.push({
          id: row.id,
          type: row.type || 'EXPIRY',
          stage: row.stage,
          severity: row.severity,
          title: row.title,
          titleAm: row.title_am,
          message: row.message,
          messageAm: row.message_am,
          timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : new Date().toISOString(),
          actionUrl: row.actionUrl || 'inventory',
          isRead: Boolean(row.isRead),
          batchId: row.batchId,
          productId: row.productId,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate,
          currentQuantity: row.currentQuantity ? parseFloat(row.currentQuantity) : 0,
          clearancePrice: row.clearancePrice ? parseFloat(row.clearancePrice) : null,
          productName: row.productName,
          productNameAm: row.productNameAm,
          photoPath: row.photoPath,
          uomCode: row.uomCode,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not query notifications table: ${err.message}`);
    }

    // 2. Stockout check
    try {
      const stockouts = await this.db.query(
        `SELECT p.id, p.sku, p.name_en, COALESCE(stock.soh, 0) as soh
         FROM products p
         LEFT JOIN (
           SELECT product_id, SUM(quantity_change) as soh
           FROM stock_ledger WHERE branch_id = $1 GROUP BY product_id
         ) stock ON p.id = stock.product_id
         WHERE p.is_active = TRUE AND COALESCE(stock.soh, 0) <= 0
         LIMIT 5`,
        [branchId],
      );
      for (const p of stockouts.rows) {
        notifications.push({
          id: `stockout-${p.id}`,
          type: 'STOCKOUT',
          severity: 'CRITICAL',
          title: `Out of Stock: ${p.name_en}`,
          titleAm: `ዕቃው አልቋል: ${p.name_en}`,
          message: `Product SKU ${p.sku} is completely depleted. Reorder immediately.`,
          messageAm: `ምርት ${p.name_en} ሙሉ በሙሉ አልቋል። በፍጥነት ይዘዙ።`,
          timestamp: new Date().toISOString(),
          actionUrl: 'items',
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not check stockouts: ${err.message}`);
    }

    // 3. Sync pending check
    try {
      const syncRes = await this.db.query(
        `SELECT COUNT(id) as count FROM sync_outbox WHERE status = 'PENDING'`,
      );
      const pendingCount = parseInt(syncRes.rows[0]?.count || '0', 10);
      if (pendingCount > 20) {
        notifications.push({
          id: 'sync-pending-warning',
          type: 'SYNC',
          severity: 'WARNING',
          title: `Unsynced Local Transactions (${pendingCount})`,
          titleAm: `ያልተመሳሰሉ የሽያጭ መረጃዎች (${pendingCount})`,
          message: `${pendingCount} transactions queued in local outbox pending upstream sync.`,
          messageAm: `${pendingCount} ሽያጮች ወደ ዋናው ሰርቨር ለመላክ ተራ እየጠበቁ ናቸው።`,
          timestamp: new Date().toISOString(),
          actionUrl: 'settings',
        });
      }
    } catch (err: any) {
      this.logger.warn(`Could not check sync status: ${err.message}`);
    }

    return notifications;
  }

  /**
   * Retrieves summary count of unread and critical notifications.
   */
  async getUnreadNotificationsCount(branchId: string): Promise<{ total: number; unread: number; critical: number }> {
    try {
      const res = await this.db.query<any>(
        `SELECT 
           COUNT(id) as total,
           COUNT(CASE WHEN is_read = FALSE THEN 1 END) as unread,
           COUNT(CASE WHEN severity = 'CRITICAL' AND is_read = FALSE THEN 1 END) as critical
         FROM notifications
         WHERE branch_id = $1
           AND dismissed = FALSE
           AND resolved = FALSE
           AND (snoozed_until IS NULL OR snoozed_until <= NOW())`,
        [branchId],
      );
      return {
        total: parseInt(res.rows[0]?.total || '0', 10),
        unread: parseInt(res.rows[0]?.unread || '0', 10),
        critical: parseInt(res.rows[0]?.critical || '0', 10),
      };
    } catch {
      return { total: 0, unread: 0, critical: 0 };
    }
  }

  /**
   * Marks a notification as read.
   */
  async markNotificationAsRead(id: string): Promise<void> {
    await this.db.query(
      `UPDATE notifications SET is_read = TRUE, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  /**
   * Snoozes a notification for a specified duration in days (default 7 days).
   */
  async snoozeNotification(id: string, days = 7): Promise<void> {
    await this.db.query(
      `UPDATE notifications
       SET snoozed_until = NOW() + ($2 || ' days')::interval, updated_at = NOW()
       WHERE id = $1`,
      [id, Math.max(1, days)],
    );
  }

  /**
   * Dismisses a single notification.
   */
  async dismissNotification(id: string): Promise<void> {
    await this.db.query(
      `UPDATE notifications SET dismissed = TRUE, updated_at = NOW() WHERE id = $1`,
      [id],
    );
  }

  /**
   * Dismisses all active notifications for a branch.
   */
  async dismissAllNotifications(branchId: string): Promise<void> {
    await this.db.query(
      `UPDATE notifications SET dismissed = TRUE, updated_at = NOW()
       WHERE branch_id = $1 AND dismissed = FALSE`,
      [branchId],
    );
  }

  /**
   * Generates a complete database JSON snapshot with SHA-256 verification hash.
   */
  async createBackup(branchId?: string): Promise<{
    metadata: {
      version: string;
      branchId: string;
      timestamp: string;
      sha256: string;
      recordCounts: Record<string, number>;
    };
    tables: Record<string, any[]>;
  }> {
    const tableNames = [
      'system_settings',
      'categories',
      'units_of_measure',
      'products',
      'product_barcodes',
      'suppliers',
      'batches',
      'stock_ledger',
      'stock_takes',
      'stock_take_items',
      'purchase_orders',
      'purchase_order_items',
      'audit_logs',
    ];

    const tables: Record<string, any[]> = {};
    const recordCounts: Record<string, number> = {};

    for (const table of tableNames) {
      try {
        const res = await this.db.query(`SELECT * FROM ${table}`);
        tables[table] = res.rows;
        recordCounts[table] = res.rows.length;
      } catch (err: any) {
        tables[table] = [];
        recordCounts[table] = 0;
      }
    }

    const payloadString = JSON.stringify(tables);
    const sha256 = crypto.createHash('sha256').update(payloadString).digest('hex');

    const metadata = {
      version: '1.0.0',
      branchId: branchId || '00000000-0000-0000-0000-000000000001',
      timestamp: new Date().toISOString(),
      sha256,
      recordCounts,
    };

    return { metadata, tables };
  }

  /**
   * Verifies SHA-256 checksum and executes a safe database restore drill.
   */
  async restoreBackup(dto: RestoreBackupDto, userId?: string): Promise<{ success: boolean; message: string; verifiedSha256: string }> {
    const { metadata, tables } = dto.backupPayload;
    if (!metadata || !tables) {
      throw new BadRequestException('Malformed backup payload.');
    }

    // Verify SHA-256
    const payloadString = JSON.stringify(tables);
    const computedSha = crypto.createHash('sha256').update(payloadString).digest('hex');

    if (computedSha !== metadata.sha256) {
      throw new BadRequestException(
        `Integrity check failed: Expected hash ${metadata.sha256}, computed ${computedSha}. Backup may be corrupted.`,
      );
    }

    // Execute safe transactional restore of configuration & master data
    await this.db.withTransaction(async (client) => {
      // Restore system_settings
      if (tables['system_settings']) {
        for (const row of tables['system_settings']) {
          await client.query(
            `INSERT INTO system_settings (key, value, updated_at)
             VALUES ($1, $2, clock_timestamp())
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
            [row.key, typeof row.value === 'string' ? row.value : JSON.stringify(row.value)],
          );
        }
      }

      // Restore categories
      if (tables['categories']) {
        for (const row of tables['categories']) {
          await client.query(
            `INSERT INTO categories (id, code, name_en, name_am, parent_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO UPDATE SET name_en = EXCLUDED.name_en, name_am = EXCLUDED.name_am`,
            [row.id, row.code, row.name_en, row.name_am, row.parent_id],
          );
        }
      }
    });

    await this.logAction({
      action: 'SYSTEM_RESTORE',
      entityName: 'database_backup',
      details: {
        timestamp: metadata.timestamp,
        sha256: computedSha,
        restoredBy: userId || 'system',
      },
    });

    return {
      success: true,
      message: 'Backup integrity verified (SHA-256 matched) and configuration restored successfully.',
      verifiedSha256: computedSha,
    };
  }

  /**
   * Terminal Management & Plan Quota Enforcement (max_terminals)
   */
  async createTerminal(dto: {
    code: string;
    name: string;
    branchId: string;
    deviceType?: string;
    ipAddress?: string;
  }) {
    const quotaRes = await this.db.query(
      `SELECT t.max_terminals, COUNT(tm.id)::int as current_terminals
       FROM tenants t
       LEFT JOIN terminals tm ON tm.tenant_id = t.id
       WHERE t.id = NULLIF(current_setting('app.current_tenant', TRUE), '')::uuid
       GROUP BY t.max_terminals`,
    );

    if (quotaRes.rows.length > 0) {
      const { max_terminals, current_terminals } = quotaRes.rows[0];
      if (current_terminals >= max_terminals) {
        throw new ForbiddenException(
          `Subscription plan terminal limit reached (${current_terminals}/${max_terminals}). Upgrade your supermarket plan in the Platform Console to register additional POS terminals.`,
        );
      }
    }

    const cleanCode = dto.code.trim().toUpperCase();
    const existing = await this.db.query(
      `SELECT id FROM terminals WHERE branch_id = $1 AND code = $2`,
      [dto.branchId, cleanCode],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Terminal code ${cleanCode} already exists in this branch.`);
    }

    const branchRes = await this.db.query(`SELECT tenant_id FROM branches WHERE id = $1`, [dto.branchId]);
    const tenantId = branchRes.rows[0]?.tenant_id || '01900000-0000-7000-8000-000000000001';

    const terminalId = generateUuidV7();
    const res = await this.db.query(
      `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type, ip_address, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, code, name, device_type, ip_address, is_active`,
      [
        terminalId,
        tenantId,
        dto.branchId,
        cleanCode,
        dto.name.trim(),
        dto.deviceType || 'POS_STATION',
        dto.ipAddress || null,
      ],
    );

    return res.rows[0];
  }

  async listTerminals(branchId?: string) {
    let sql = `SELECT id, branch_id, code, name, device_type, ip_address, is_active, last_active_at, created_at FROM terminals`;
    const params: any[] = [];
    if (branchId) {
      sql += ` WHERE branch_id = $1`;
      params.push(branchId);
    }
    sql += ` ORDER BY code ASC`;
    const res = await this.db.query(sql, params);
    return res.rows;
  }

  /**
   * Strictly tenant-isolated data reset.
   * Wipes transactional data: sales, shifts, payments, stock movements, batches, GRNs, POs.
   * Preserves tenant, users, branches, and system settings.
   * Optionally deletes products if requested.
   */
  async resetTenantData(
    tenantId: string,
    deleteProducts: boolean = false,
    userId?: string,
  ): Promise<{ success: boolean; message: string; deletedCounts: Record<string, number> }> {
    if (!tenantId) {
      throw new BadRequestException('tenantId is required for data reset');
    }

    const deletedCounts: Record<string, number> = {};

    await this.db.withTransaction(async (client) => {
      // 1. Sale items & refunds
      const rItems = await client.query(
        `DELETE FROM sale_refund_items WHERE refund_id IN (
           SELECT id FROM sale_refunds WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)
         )`,
        [tenantId],
      );
      deletedCounts['sale_refund_items'] = rItems.rowCount || 0;

      const rRefunds = await client.query(
        `DELETE FROM sale_refunds WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['sale_refunds'] = rRefunds.rowCount || 0;

      const rSaleItems = await client.query(
        `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['sale_items'] = rSaleItems.rowCount || 0;

      const rPayments = await client.query(
        `DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['sale_payments'] = rPayments.rowCount || 0;

      const rFiscal = await client.query(
        `DELETE FROM fiscal_receipt_logs WHERE sale_id IN (SELECT id FROM sales WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['fiscal_receipt_logs'] = rFiscal.rowCount || 0;

      const rSales = await client.query(`DELETE FROM sales WHERE tenant_id = $1`, [tenantId]);
      deletedCounts['sales'] = rSales.rowCount || 0;

      // 2. Cash movements & Shifts
      const rCash = await client.query(
        `DELETE FROM cash_movements WHERE shift_id IN (SELECT id FROM shifts WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['cash_movements'] = rCash.rowCount || 0;

      const rShifts = await client.query(`DELETE FROM shifts WHERE tenant_id = $1`, [tenantId]);
      deletedCounts['shifts'] = rShifts.rowCount || 0;

      // 3. Stock ledger & Adjustments
      const rAdjItems = await client.query(
        `DELETE FROM stock_adjustment_items WHERE adjustment_id IN (
           SELECT id FROM stock_adjustments WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)
         )`,
        [tenantId],
      );
      deletedCounts['stock_adjustment_items'] = rAdjItems.rowCount || 0;

      const rAdj = await client.query(
        `DELETE FROM stock_adjustments WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['stock_adjustments'] = rAdj.rowCount || 0;

      const rStockLedger = await client.query(
        `DELETE FROM stock_ledger WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['stock_ledger'] = rStockLedger.rowCount || 0;

      const rBatches = await client.query(
        `DELETE FROM batches WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['batches'] = rBatches.rowCount || 0;

      // 4. Stock Takes
      const rStkItems = await client.query(
        `DELETE FROM stock_take_items WHERE stock_take_id IN (
           SELECT id FROM stock_takes WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)
         )`,
        [tenantId],
      );
      deletedCounts['stock_take_items'] = rStkItems.rowCount || 0;

      const rStk = await client.query(
        `DELETE FROM stock_takes WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['stock_takes'] = rStk.rowCount || 0;

      // 5. Goods Received Notes & POs
      const rGrnItems = await client.query(
        `DELETE FROM grn_items WHERE grn_id IN (
           SELECT id FROM goods_received_notes WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)
         )`,
        [tenantId],
      );
      deletedCounts['grn_items'] = rGrnItems.rowCount || 0;

      const rGrn = await client.query(
        `DELETE FROM goods_received_notes WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['goods_received_notes'] = rGrn.rowCount || 0;

      const rPoItems = await client.query(
        `DELETE FROM purchase_order_items WHERE purchase_order_id IN (
           SELECT id FROM purchase_orders WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)
         )`,
        [tenantId],
      );
      deletedCounts['purchase_order_items'] = rPoItems.rowCount || 0;

      const rPo = await client.query(
        `DELETE FROM purchase_orders WHERE branch_id IN (SELECT id FROM branches WHERE tenant_id = $1)`,
        [tenantId],
      );
      deletedCounts['purchase_orders'] = rPo.rowCount || 0;

      // 6. Optional: Products deletion
      if (deleteProducts) {
        await client.query(`DELETE FROM product_barcodes WHERE product_id IN (SELECT id FROM products WHERE tenant_id = $1)`, [tenantId]);
        await client.query(`DELETE FROM branch_product_overrides WHERE product_id IN (SELECT id FROM products WHERE tenant_id = $1)`, [tenantId]);
        const rProd = await client.query(`DELETE FROM products WHERE tenant_id = $1`, [tenantId]);
        deletedCounts['products'] = rProd.rowCount || 0;
      }
    });

    await this.logAction({
      action: 'DATA_RESET',
      entityName: 'tenant_data',
      details: {
        tenantId,
        deleteProducts,
        deletedBy: userId || 'owner',
        counts: deletedCounts,
      },
    });

    return {
      success: true,
      message: 'Tenant operational and sales data reset successfully with strict isolation.',
      deletedCounts,
    };
  }
}
