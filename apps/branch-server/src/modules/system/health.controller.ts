/**
 * GebeyaOS Branch Server – /health and /ready endpoints (Part 0, Fix #6)
 *
 * GET /health  – liveness: is the process alive?
 * GET /ready   – readiness: is the database reachable and migrations applied?
 *
 * Neither endpoint leaks secrets, tenant data, or internal errors.
 */

import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness probe – always returns 200 if the process is up */
  @Get('health')
  health() {
    return {
      status: 'ok',
      uptime_seconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness probe – 200 only when DB is reachable and migrations are applied */
  @Get('ready')
  async ready() {
    try {
      const result = await this.db.query(
        `SELECT COUNT(*) AS migration_count
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name IN ('tenants', 'branches', 'products', 'sales')`,
      );
      const count = parseInt(result.rows[0]?.migration_count ?? '0', 10);
      if (count < 4) {
        return {
          status: 'not_ready',
          reason: 'Migrations have not been applied yet. Run migrations first.',
          db: 'reachable',
          timestamp: new Date().toISOString(),
        };
      }
      return {
        status: 'ok',
        db: 'reachable',
        core_tables: count,
        uptime_seconds: Math.floor(process.uptime()),
        version: process.env.APP_VERSION ?? '1.0.0',
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown database error';
      console.error('[HealthController] DB readiness check failed:', message);
      return {
        status: 'not_ready',
        reason: 'Database is not reachable. Check DB_HOST, DB_PORT, DB_USER, and DB_NAME.',
        db: 'unreachable',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
