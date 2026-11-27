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
