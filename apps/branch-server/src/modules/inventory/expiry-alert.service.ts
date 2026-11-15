import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { computeDaysLeftInAddis } from '@gebeyaos/shared-types';

export interface ExpiryAlertScanResult {
  scannedBatches: number;
  alertsCreated: number;
  batchesResolved: number;
  expiredTodayCount: number;
  expiringThisWeekCount: number;
}

@Injectable()
export class ExpiryAlertService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpiryAlertService.name);
  private dailyCheckInterval: NodeJS.Timeout | null = null;

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap() {
    // Run automated scan on server startup
    try {
      this.logger.log('Executing startup scan for stock expiry alerts...');
      await this.scanAndGenerateAlerts();
    } catch (err: any) {
      this.logger.error(`Failed to execute startup expiry scan: ${err.message}`);
    }

    // Schedule daily check (every 24 hours)
    this.dailyCheckInterval = setInterval(async () => {
      try {
        await this.scanAndGenerateAlerts();
      } catch (err: any) {
        this.logger.error(`Daily expiry scan failed: ${err.message}`);
      }
    }, 24 * 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.dailyCheckInterval) {
      clearInterval(this.dailyCheckInterval);
    }
  }

  /**
   * Scans active non-empty batches and idempotently generates stage-based notifications.
   */
  async scanAndGenerateAlerts(targetBranchId?: string): Promise<ExpiryAlertScanResult> {
    const res = await this.db.query<any>(
      `SELECT b.id as batch_id, b.batch_number, b.product_id, b.current_quantity,
              b.expiry_date, b.unit_cost, b.branch_id, b.tenant_id,
              p.name_en, p.name_am, p.sku, p.uom_code, p.category_id,
              c.name_en as category_name
       FROM batches b
       JOIN products p ON b.product_id = p.id
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE b.current_quantity > 0 AND b.expiry_date IS NOT NULL
         AND ($1::uuid IS NULL OR b.branch_id = $1)`,
      [targetBranchId || null],
    );

    let alertsCreated = 0;
    let expiredTodayCount = 0;
    let expiringThisWeekCount = 0;

    for (const row of res.rows) {
      const daysLeft = computeDaysLeftInAddis(row.expiry_date);
      if (daysLeft === null) continue;

      let stage: 'EXPIRED' | '7D' | '30D' | '90D' | null = null;
      let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO';

      if (daysLeft <= 0) {
        stage = 'EXPIRED';
        severity = 'CRITICAL';
        if (daysLeft === 0) expiredTodayCount++;
      } else if (daysLeft <= 7) {
        stage = '7D';
        severity = 'CRITICAL';
        expiringThisWeekCount++;
      } else if (daysLeft <= 30) {
        stage = '30D';
        severity = 'WARNING';
      } else if (daysLeft <= 90) {
        stage = '90D';
        severity = 'WARNING';
      }

      if (!stage) continue;

      // Idempotency check: don't create duplicate notification for the same batch at the same stage
      const existing = await this.db.query(
        `SELECT id FROM notifications
         WHERE batch_id = $1 AND stage = $2 AND (resolved = FALSE OR created_at >= NOW() - INTERVAL '14 days')
         LIMIT 1`,
        [row.batch_id, stage],
      );

      if (existing.rows.length === 0) {
        const titleEn =
          stage === 'EXPIRED'
            ? `Expired: ${row.name_en} (Batch ${row.batch_number})`
            : stage === '7D'
            ? `Expiring in ${daysLeft} days: ${row.name_en}`
            : `Advance Warning (${stage}): ${row.name_en}`;

        const titleAm =
          stage === 'EXPIRED'
            ? `ጊዜው ያለፈበት: ${row.name_am || row.name_en} (ባች ${row.batch_number})`
            : stage === '7D'
            ? `በ${daysLeft} ቀናት ውስጥ ያበቃል: ${row.name_am || row.name_en}`
            : `የቅድሚያ ማስጠንቀቂያ: ${row.name_am || row.name_en}`;

        const msgEn =
          stage === 'EXPIRED'
            ? `Batch ${row.batch_number} (${row.current_quantity} ${row.uom_code || 'PCS'}) expired on ${row.expiry_date}. Put aside for write-off.`
            : `Batch ${row.batch_number} (${row.current_quantity} ${row.uom_code || 'PCS'}) expires on ${row.expiry_date}. Plan clearance sale.`;

        const msgAm =
          stage === 'EXPIRED'
            ? `ባች ${row.batch_number} (${row.current_quantity} ${row.uom_code || 'እቃዎች'}) በ${row.expiry_date} ጊዜው አልፏል። ለማስወገድ ለይተው ያስቀምጡ።`
            : `ባች ${row.batch_number} (${row.current_quantity} ${row.uom_code || 'እቃዎች'}) በ${row.expiry_date} ያበቃል። የክሊራንስ ቅናሽ ያቅዱ።`;

        await this.db.query(
          `INSERT INTO notifications (
             tenant_id, branch_id, type, stage, severity,
             title, title_am, message, message_am,
             action_url, batch_id, product_id, is_read, dismissed, resolved, created_at, updated_at
           ) VALUES ($1, $2, 'EXPIRY', $3, $4, $5, $6, $7, $8, 'inventory', $9, $10, FALSE, FALSE, FALSE, NOW(), NOW())`,
          [
            row.tenant_id,
            row.branch_id,
            stage,
            severity,
            titleEn,
            titleAm,
            msgEn,
            msgAm,
            row.batch_id,
            row.product_id,
          ],
        );
        alertsCreated++;
      }
    }

    // Auto-resolve notifications for depleted batches
    const resolveRes = await this.db.query(
      `UPDATE notifications n
       SET resolved = TRUE, updated_at = NOW()
       FROM batches b
       WHERE n.batch_id = b.id AND b.current_quantity <= 0 AND n.resolved = FALSE
       RETURNING n.id`,
    );
    const batchesResolved = resolveRes.rows.length;

    // Daily summary log / stub dispatch
    if (alertsCreated > 0 || expiredTodayCount > 0 || expiringThisWeekCount > 0) {
      this.logger.log(
        `[ExpirySummary] Daily Expiry Alert Summary: ${expiredTodayCount} batches expired today, ${expiringThisWeekCount} batches expiring within 7 days. ${alertsCreated} new notifications created.`,
      );
    }

    return {
      scannedBatches: res.rows.length,
      alertsCreated,
      batchesResolved,
      expiredTodayCount,
      expiringThisWeekCount,
    };
  }
}
