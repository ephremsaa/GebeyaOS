import { Injectable, NestMiddleware, Logger, Optional } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { TenantContextService, TenantContext } from './tenant-context.service';
import { JWT_SECRET } from '../guards/jwt-auth.guard';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// In-memory sliding rate limit store
const tenantRateLimits = new Map<string, RateLimitEntry>();

// Rate limit configuration (default: 1000 requests per 60 seconds per tenant)
let RATE_LIMIT_MAX = 1000;
let RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function setRateLimitConfig(max: number, windowMs: number = 60 * 1000) {
  RATE_LIMIT_MAX = max;
  RATE_LIMIT_WINDOW_MS = windowMs;
}

export function resetRateLimits() {
  tenantRateLimits.clear();
}

export function getTenantRateLimitCount(tenantId: string): number {
  return tenantRateLimits.get(tenantId)?.count || 0;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger('TenantHTTP');

  private readonly tenantContextService: TenantContextService;

  constructor(@Optional() tenantContextService?: TenantContextService) {
    this.tenantContextService = tenantContextService || new TenantContextService();
  }

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    let tenantContext: TenantContext | null = null;
    const authHeader = req.headers['authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && (decoded.tenantId || decoded.tenant_id || decoded.isPlatformAdmin)) {
          tenantContext = {
            tenantId: decoded.tenantId || decoded.tenant_id || '',
            branchId: decoded.branchId || decoded.branch_id,
            userId: decoded.sub || decoded.userId,
            username: decoded.username,
            role: decoded.role || (decoded.isPlatformAdmin ? 'PLATFORM_ADMIN' : undefined),
            isPlatformAdmin: decoded.isPlatformAdmin ?? false,
          };
        }
      } catch {
        // Invalid or expired token: do not set tenant context.
      }
    }

    // Rate Limiting Check (per tenant)
    const rateLimitKey = tenantContext?.tenantId || (req.ip || 'anonymous');
    const now = Date.now();
    let entry = tenantRateLimits.get(rateLimitKey);

    if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      entry = { count: 1, windowStart: now };
      tenantRateLimits.set(rateLimitKey, entry);
    } else {
      entry.count++;
    }

    // Enforce rate limit (skip if health check)
    const isHealthCheck = req.path === '/health' || req.path === '/api/health';
    if (!isHealthCheck && entry.count > RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      res.status(429).json({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Tenant request quota exceeded (${RATE_LIMIT_MAX} requests per minute). Please try again later.`,
        tenantId: tenantContext?.tenantId || null,
        retryAfterSeconds: retryAfter,
      });
      return;
    }

    // Structured JSON log with tenant_id and branch_id on response finish
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const structuredLog = {
        timestamp: new Date().toISOString(),
        tenant_id: tenantContext?.tenantId || null,
        branch_id: tenantContext?.branchId || null,
        user_id: tenantContext?.userId || null,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: durationMs,
        ip: req.ip || req.socket?.remoteAddress || null,
      };

      if (res.statusCode >= 500) {
        this.logger.error(JSON.stringify(structuredLog));
      } else if (res.statusCode >= 400) {
        this.logger.warn(JSON.stringify(structuredLog));
      } else {
        this.logger.log(JSON.stringify(structuredLog));
      }
    });

    if (tenantContext) {
      this.tenantContextService.runWithContext(tenantContext, () => next());
    } else {
      this.tenantContextService.runWithContext({ tenantId: '' }, () => next());
    }
  }
}
