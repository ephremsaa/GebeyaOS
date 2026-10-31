import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const IP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 30;

interface IpRateRecord {
  count: number;
  windowStart: number;
}

const ipAttempts = new Map<string, IpRateRecord>();

@Injectable()
export class RateLimiterService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Check IP-level rate limiting
   */
  checkIpRateLimit(ipAddress?: string): void {
    if (!ipAddress) return;
    const now = Date.now();
    const record = ipAttempts.get(ipAddress);

    if (!record || now - record.windowStart > IP_RATE_LIMIT_WINDOW_MS) {
      ipAttempts.set(ipAddress, { count: 1, windowStart: now });
      return;
    }

    record.count++;
    if (record.count > IP_MAX_ATTEMPTS) {
      const waitSeconds = Math.ceil((record.windowStart + IP_RATE_LIMIT_WINDOW_MS - now) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Too many requests from this network. Please try again in ${Math.ceil(waitSeconds / 60)} minute(s).`,
          remainingSeconds: waitSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Check account-level lockout for tenant users
   */
  assertNotLocked(lockedUntil: Date | string | null | undefined): void {
    if (lockedUntil && new Date(lockedUntil) > new Date()) {
      const remainingSeconds = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Account Locked',
          message: `Account is temporarily locked due to repeated failed logins. Please try again in ${Math.ceil(
            remainingSeconds / 60,
          )} minute(s) (${remainingSeconds}s).`,
          remainingSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Register failed attempt for a user, calculate new lockout if limit reached
   */
  async recordFailedAttempt(
    userId: string,
    currentFailedCount: number,
    tenantId?: string,
  ): Promise<{ isLocked: boolean; remainingAttempts: number; lockedUntil: Date | null }> {
    const newCount = (currentFailedCount || 0) + 1;
    let lockedUntil: Date | null = null;
    let isLocked = false;

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      isLocked = true;
      await this.db.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [newCount, lockedUntil, userId],
        tenantId,
      );
    } else {
      await this.db.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
        [newCount, userId],
        tenantId,
      );
    }

    const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - newCount);
    return { isLocked, remainingAttempts, lockedUntil };
  }

  /**
   * Reset failed attempts upon successful login
   */
  async resetFailedAttempts(userId: string, tenantId?: string): Promise<void> {
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1`,
      [userId],
      tenantId,
    );
  }

  /**
   * Register failed attempt for a platform admin, calculate new lockout if limit reached
   */
  async recordPlatformFailedAttempt(
    adminId: string,
    currentFailedCount: number,
  ): Promise<{ isLocked: boolean; remainingAttempts: number; lockedUntil: Date | null }> {
    const newCount = (currentFailedCount || 0) + 1;
    let lockedUntil: Date | null = null;
    let isLocked = false;

    if (newCount >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      isLocked = true;
      await this.db.query(
        `UPDATE platform_admins SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
        [newCount, lockedUntil, adminId],
      );
    } else {
      await this.db.query(
        `UPDATE platform_admins SET failed_login_attempts = $1 WHERE id = $2`,
        [newCount, adminId],
      );
    }

    const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - newCount);
    return { isLocked, remainingAttempts, lockedUntil };
  }

  /**
   * Reset failed attempts upon successful platform admin login
   */
  async resetPlatformFailedAttempts(adminId: string): Promise<void> {
    await this.db.query(
      `UPDATE platform_admins SET failed_login_attempts = 0, locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1`,
      [adminId],
    );
  }

  /**
   * Reset memory IP tracker (used in testing)
   */
  resetIpRateLimits(): void {
    ipAttempts.clear();
  }
}

