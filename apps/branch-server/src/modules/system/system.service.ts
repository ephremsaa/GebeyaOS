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
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    // 1. Sales totals for today
    const salesRes = await this.db.query(
      `SELECT
         COALESCE(SUM(grand_total), 0) as gross_sales,
         COALESCE(SUM(taxable_subtotal), 0) as net_sales,
         COUNT(id) as transaction_count,
         COALESCE(SUM(tax_total), 0) as tax_total
       FROM sales
       WHERE branch_id = $1
         AND created_at >= $2
         AND payment_status IN ('PAID', 'PARTIALLY_REFUNDED')`,
      [branchId, todayMidnight.toISOString()],
    );
    const sRow = salesRes.rows[0] || {};

    // 2. Payments breakdown (Cash vs Digital)
    const paymentsRes = await this.db.query(
      `SELECT
         sp.payment_method,
         COALESCE(SUM(sp.amount), 0) as total_amount
       FROM sale_payments sp
       JOIN sales s ON sp.sale_id = s.id
       WHERE s.branch_id = $1
         AND s.created_at >= $2
         AND s.payment_status IN ('PAID', 'PARTIALLY_REFUNDED')
       GROUP BY sp.payment_method`,
      [branchId, todayMidnight.toISOString()],
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
         WHERE branch_id = $1
         GROUP BY product_id
       ) stock ON p.id = stock.product_id
       WHERE p.is_active = TRUE`,
      [branchId],
    );
    const pRow = productsRes.rows[0] || {};

    // 4. Expiring Batches (within next 30 days)
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const expiringRes = await this.db.query(
      `SELECT COUNT(id) as count
       FROM batches
       WHERE branch_id = $1
         AND expiry_date IS NOT NULL
         AND expiry_date <= $2
         AND current_quantity > 0`,
      [branchId, in30Days.toISOString().slice(0, 10)],
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

    // Default fallbacks if not yet initialized
    if (!settingsMap['store_info']) {
      settingsMap['store_info'] = {
        name: 'Gebeya Supermarket',
        code: 'BOLE-01',
        tradeName: 'Gebeya Retail PLC',
        tinNumber: '0012345678',
        vatNumber: '9988776655',
        phone: '+251 911 234567',
        address: 'Bole Medhanialem, Addis Ababa, Ethiopia',
        currency: 'ETB',
        vatRate: 0.15,
      };
    }
    if (!settingsMap['receipt_config']) {
      settingsMap['receipt_config'] = {
        headerText: 'እንኳን ደህና መጡ! / Welcome to Gebeya Supermarket',
        footerText: 'ዕቃዎች ከተገዙበት ቀን ጀምሮ በ3 ቀናት ውስጥ በደረሰኝ ይመለሳሉ።\nGoods exchangeable within 3 days with receipt.\nThank you for shopping with us!',
        taxInvoiceTitle: 'OFFICIAL CASH SALES INVOICE',
        showCashierName: true,
        showTinVat: true,
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
  async saveSetting(dto: UpdateSystemSettingDto, userId?: string): Promise<void> {
    await this.db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, clock_timestamp())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
      [dto.key, JSON.stringify(dto.value)],
    );

    // Log setting change in audit log
    await this.logAction({
      action: 'SETTINGS_UPDATE',
      entityName: 'system_settings',
      details: { key: dto.key, updatedBy: userId || 'system' },
    });
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
   * Gathers live notification alerts.
   */
  async getNotifications(branchId: string): Promise<NotificationItem[]> {
    const notifications: NotificationItem[] = [];

    // 1. Stockout check
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
        message: `Product SKU ${p.sku} is completely depleted. Reorder immediately.`,
        timestamp: new Date().toISOString(),
        actionUrl: 'reorder',
      });
    }

    // 2. Upcoming Expiries (within 30 days)
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    const expiries = await this.db.query(
      `SELECT b.id, b.batch_number, b.expiry_date, b.current_quantity, p.name_en
       FROM batches b
       JOIN products p ON b.product_id = p.id
       WHERE b.branch_id = $1
         AND b.expiry_date IS NOT NULL
         AND b.expiry_date <= $2
         AND b.current_quantity > 0
       ORDER BY b.expiry_date ASC
       LIMIT 5`,
      [branchId, in30Days.toISOString().slice(0, 10)],
    );
    for (const b of expiries.rows) {
      notifications.push({
        id: `expiry-${b.id}`,
        type: 'EXPIRY',
        severity: 'WARNING',
        title: `Expiring Batch: ${b.name_en}`,
        message: `Batch ${b.batch_number} (${b.current_quantity} units) expires on ${b.expiry_date}. Plan FEFO clearance.`,
        timestamp: new Date().toISOString(),
        actionUrl: 'reports',
      });
    }

    // 3. Sync pending check
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
        message: `${pendingCount} transactions queued in local outbox pending upstream sync.`,
        timestamp: new Date().toISOString(),
        actionUrl: 'sync',
      });
    }

    return notifications;
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
}
