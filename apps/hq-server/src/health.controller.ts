import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './common/database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'gebeyaos-hq-server',
      uptime_seconds: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.db.query('SELECT 1');
      return {
        status: 'ok',
        service: 'gebeyaos-hq-server',
        db: 'reachable',
        uptime_seconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'database error';
      console.error('[HqHealth] DB readiness check failed:', message);
      return {
        status: 'not_ready',
        service: 'gebeyaos-hq-server',
        reason: 'Central database unreachable',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
