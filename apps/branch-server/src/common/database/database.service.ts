import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  private readonly tenantContextService: TenantContextService;

  constructor(
    @Optional() tenantContextService?: TenantContextService,
  ) {
    this.tenantContextService = tenantContextService || new TenantContextService();
  }

  async onModuleInit() {
    // Parse PostgreSQL DATE (OID 1082) as exact YYYY-MM-DD string without timezone shifting
    types.setTypeParser(1082, (val: string) => val);

    this.pool = process.env.DATABASE_URL
      ? new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
          max: parseInt(process.env.DB_POOL_MAX || '20', 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        })
      : new Pool({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          database: process.env.DB_NAME || 'gebeyaos_branch',
          max: parseInt(process.env.DB_POOL_MAX || '20', 10),
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

    this.pool.on('error', (err) => {
      this.logger.error('Unexpected error on idle PostgreSQL client', err.stack);
    });

    await this.ensureMigrationsApplied();
    await this.ensureReferenceSeeds();
  }

  private async ensureReferenceSeeds() {
    try {
      await this.pool.query(
        `INSERT INTO units_of_measure (code, name_en, name_am, allow_fractions) VALUES
          ('PCS', 'Pieces', 'ፍሬ', FALSE),
          ('KG', 'Kilograms', 'ኪሎ ግራም', TRUE),
          ('G', 'Grams', 'ግራም', TRUE),
          ('L', 'Liters', 'ሊትር', TRUE),
          ('ML', 'Milliliters', 'ሚሊ ሊትር', TRUE),
          ('PACK', 'Pack', 'ፓኬት', FALSE),
          ('BOX', 'Box / Carton', 'ካርቶን', FALSE),
          ('BUNDLE', 'Bundle', 'እስር', FALSE)
        ON CONFLICT (code) DO NOTHING`,
      );
      await this.pool.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_encrypted TEXT;
         ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_encrypted TEXT;`,
      );
      await this.pool.query(
        `INSERT INTO permissions (id, module, description) VALUES
          ('pos:shift:open', 'POS', 'Open a register shift with opening cash float'),
          ('pos:shift:close', 'POS', 'Close register shift and perform cash reconciliation'),
          ('pos:sale:create', 'POS', 'Process checkout sales and tender payments'),
          ('pos:sale:hold', 'POS', 'Hold and resume active customer carts'),
          ('pos:sale:discount', 'POS', 'Apply item or transaction level discounts'),
          ('pos:sale:refund', 'POS', 'Authorize and process customer returns and refunds'),
          ('pos:receipt:reprint', 'POS', 'Reprint customer receipts with audit logging'),
          ('pos:cash:movement', 'POS', 'Perform cash-in, safe drops, and petty cash out'),
          ('catalog:product:view', 'CATALOG', 'View product catalog and prices'),
          ('catalog:product:create', 'CATALOG', 'Create new products in catalog'),
          ('catalog:product:edit', 'CATALOG', 'Edit product metadata and master prices'),
          ('catalog:cost:view', 'CATALOG', 'View supplier cost prices and wholesale margins'),
          ('catalog:price:override', 'CATALOG', 'Set branch-specific price and tax overrides'),
          ('inventory:stock:view', 'INVENTORY', 'View stock balances and batch expiry'),
          ('inventory:adjust:create', 'INVENTORY', 'Create stock adjustments and write-offs'),
          ('inventory:adjust:approve', 'INVENTORY', 'Approve stock adjustments'),
          ('inventory:stocktake:execute', 'INVENTORY', 'Conduct physical stock count'),
          ('inventory:stocktake:reconcile', 'INVENTORY', 'Reconcile stock take and post variances'),
          ('inventory:import:execute', 'INVENTORY', 'Import products and inventory via Excel/CSV'),
          ('purchasing:po:create', 'PURCHASING', 'Create and issue purchase orders'),
          ('purchasing:grn:receive', 'PURCHASING', 'Receive goods (GRN) and log landed costs'),
          ('reports:branch:view', 'REPORTS', 'View branch revenue, gross margins, and tax reports'),
          ('admin:users:manage', 'ADMIN', 'Manage staff users, PINs, and passwords'),
          ('admin:roles:manage', 'ADMIN', 'Create and edit custom roles and permissions'),
          ('admin:settings:manage', 'ADMIN', 'Configure branch and system settings')
        ON CONFLICT (id) DO NOTHING`,
      );
    } catch (err: any) {
      this.logger.warn(`Reference UOM seed skipped: ${err.message}`);
    }
  }

  private async ensureMigrationsApplied() {
    try {
      const check = await this.pool.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('tenants', 'branches', 'products', 'sales', 'platform_admins')`,
      );
      const count = parseInt(check.rows[0]?.cnt || '0', 10);
      if (count >= 5) return;

      const candidates = [
        path.resolve(process.cwd(), 'database/migrations'),
        path.resolve(__dirname, '../../../../database/migrations'),
        path.resolve(__dirname, '../../../../../database/migrations'),
      ];
      const migrationsDir = candidates.find((p) => fs.existsSync(p));
      if (!migrationsDir) {
        this.logger.warn('Migrations directory not found for auto-migration.');
        return;
      }

      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      this.logger.log(`Auto-applying ${files.length} SQL migrations from ${migrationsDir}...`);
      for (const file of files) {
        try {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await this.pool.query(sql);
        } catch (err: any) {
          this.logger.warn(`Migration ${file}: ${err.message}`);
        }
      }
      this.logger.log('Auto-migrations complete.');
    } catch (err: any) {
      this.logger.warn(`Auto-migration check skipped: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
    overrideTenantId?: string,
  ): Promise<QueryResult<T>> {
    const tenantId = overrideTenantId || this.tenantContextService?.getTenantId();
    if (tenantId) {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT set_tenant_context($1)', [tenantId]);
        return await client.query<T>(text, params);
      } finally {
        try {
          await client.query("SELECT set_config('app.current_tenant', '', FALSE)");
        } catch {}
        client.release();
      }
    }
    return this.pool.query<T>(text, params);
  }

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    overrideTenantId?: string,
  ): Promise<T> {
    const client = await this.pool.connect();
    const tenantId = overrideTenantId || this.tenantContextService?.getTenantId();
    try {
      await client.query('BEGIN');
      if (tenantId) {
        await client.query('SELECT set_tenant_context($1)', [tenantId]);
      }
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      try {
        await client.query("SELECT set_config('app.current_tenant', '', FALSE)");
      } catch {}
      client.release();
    }
  }
}
