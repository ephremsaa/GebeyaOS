import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
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

  onModuleInit() {
    this.pool = new Pool({
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
