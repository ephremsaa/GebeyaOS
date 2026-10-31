import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser, PlatformAdminUser, generateUuidV7 } from '@gebeyaos/shared-types';

export const TENANT_JWT_SECRET =
  process.env.JWT_SECRET || 'super-secret-jwt-key-for-gebeyaos-lan-offline-first-pos-2026';
export const PLATFORM_JWT_SECRET =
  process.env.PLATFORM_JWT_SECRET || 'gebeyaos-platform-master-auth-secret-key-2026';

export const TENANT_ISSUER = 'gebeyaos-branch';
export const TENANT_AUDIENCE = 'gebeyaos-tenant-app';

export const PLATFORM_ISSUER = 'gebeyaos-platform';
export const PLATFORM_AUDIENCE = 'gebeyaos-platform-console';

export const ACCESS_TOKEN_EXPIRY_SECONDS = 900; // 15 minutes
export const REFRESH_TOKEN_DAYS = 7;
export const PLATFORM_ABSOLUTE_TIMEOUT_HOURS = 8;
export const PLATFORM_IDLE_TIMEOUT_MINUTES = 30;

export interface TokenFamilyInfo {
  userId: string;
  familyId: string;
  rawSecret: string;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * 1. Issue Tenant Access Token & Initial Refresh Token Family
   */
  async createTenantSessionTokens(
    user: AuthenticatedUser,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
    existingFamilyId?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; familyId: string }> {
    const familyId = existingFamilyId || generateUuidV7();
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    // Retrieve user's current token_version
    const userRow = await this.db.query(
      `SELECT token_version, is_active FROM users WHERE id = $1`,
      [user.id],
      user.tenantId,
    );
    const tokenVersion = userRow?.rows?.[0]?.token_version || 1;

    const payload = {
      sub: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenantSlug,
      tenantName: user.tenantName,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      permissions: user.permissions,
      tokenVersion,
      familyId,
    };

    const accessToken = jwt.sign(payload, TENANT_JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: TENANT_ISSUER,
      audience: TENANT_AUDIENCE,
    });

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO refresh_tokens (id, tenant_id, user_id, family_id, token_hash, device_info, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        generateUuidV7(),
        user.tenantId,
        user.id,
        familyId,
        tokenHash,
        deviceInfo || 'Browser Session',
        ipAddress || '127.0.0.1',
        userAgent || null,
        expiresAt,
      ],
      user.tenantId,
    );

    return {
      accessToken,
      refreshToken: `${user.id}.${familyId}.${rawSecret}`,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      familyId,
    };
  }

  /**
   * 2. Rotate Tenant Refresh Token (with Token Reuse Detection)
   */
  async rotateTenantRefreshToken(
    rawCombinedToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: AuthenticatedUser }> {
    const parts = rawCombinedToken.split('.');
    if (parts.length < 3) {
      throw new UnauthorizedException('Malformed refresh token');
    }
    const [userId, familyId, rawSecret] = parts;
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    // Find the token record
    const res = await this.db.query(
      `SELECT rt.id, rt.tenant_id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
              u.username, u.full_name, u.email, u.phone, u.role_id, r.name as role_name,
              u.default_branch_id, b.code as branch_code, b.name as branch_name,
              t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
              u.is_active, u.token_version, u.force_password_change,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN tenants t ON t.id = u.tenant_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.default_branch_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE rt.token_hash = $1 AND rt.user_id = $2
       GROUP BY rt.id, rt.tenant_id, rt.user_id, rt.family_id, rt.expires_at, rt.revoked_at,
                u.username, u.full_name, u.email, u.phone, u.role_id, r.name,
                u.default_branch_id, b.code, b.name, t.name, t.slug, t.status,
                u.is_active, u.token_version, u.force_password_change`,
      [tokenHash, userId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const row = res.rows[0];

    // REUSE DETECTION: If token was already revoked, revoke the ENTIRE token family!
    if (row.revoked_at) {
      this.logger.error(
        `🚨 SECURITY ALERT: Refresh token reuse detected for user ${userId} in family ${familyId}. Revoking all family tokens!`,
      );
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE family_id = $1`,
        [familyId],
        row.tenant_id,
      );
      await this.logSecurityAlert(row.tenant_id, userId, 'REFRESH_TOKEN_REUSE_DETECTED', ipAddress, {
        familyId,
      });
      throw new UnauthorizedException('Session compromised: refresh token reuse detected. Please sign in again.');
    }

    // Check expiration
    if (new Date(row.expires_at) < new Date()) {
      throw new UnauthorizedException('Refresh token has expired. Please sign in again.');
    }

    // Check if user is active and tenant is not suspended
    if (!row.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }

    // Mark current token as revoked (one-time use rotation)
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE id = $1`,
      [row.id],
      row.tenant_id,
    );

    const authUser: AuthenticatedUser = {
      id: row.user_id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantName: row.tenant_name,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role_name,
      roleId: row.role_id,
      branchId: row.default_branch_id || '00000000-0000-0000-0000-000000000001',
      branchCode: row.branch_code,
      branchName: row.branch_name,
      permissions: row.permissions || [],
      forcePasswordChange: !!row.force_password_change,
    };

    // Issue next token in the same family
    const session = await this.createTenantSessionTokens(
      authUser,
      row.device_info,
      ipAddress,
      userAgent,
      familyId,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      user: authUser,
    };
  }

  /**
   * 3. Revoke single token or entire family
   */
  async revokeTenantToken(rawCombinedToken: string): Promise<void> {
    const parts = rawCombinedToken.split('.');
    if (parts.length < 3) return;
    const [, , rawSecret] = parts;
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE token_hash = $1`,
      [tokenHash],
    );
  }

  async revokeAllTenantSessions(userId: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      // 1. Invalidate all refresh tokens
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
      // 2. Increment token_version to reject existing access tokens
      await client.query(
        `UPDATE users SET token_version = token_version + 1 WHERE id = $1`,
        [userId],
      );
    });
  }

  /**
   * 4. Platform Admin Sessions & Rotation
   */
  async createPlatformSessionTokens(
    admin: PlatformAdminUser,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
    existingFamilyId?: string,
    rememberDevice?: boolean,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; familyId: string }> {
    const familyId = existingFamilyId || generateUuidV7();
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const adminRow = await this.db.query(
      `SELECT token_version FROM platform_admins WHERE id = $1`,
      [admin.id],
    );
    const tokenVersion = adminRow.rows[0]?.token_version || 1;

    const payload = {
      sub: admin.id,
      username: admin.username,
      email: admin.email,
      role: admin.role || 'SUPER_ADMIN',
      isPlatformAdmin: true,
      tokenVersion,
      familyId,
    };

    const accessToken = jwt.sign(payload, PLATFORM_JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      issuer: PLATFORM_ISSUER,
      audience: PLATFORM_AUDIENCE,
    });

    const isRemembered = rememberDevice || deviceInfo?.includes('[remember_device]');
    const expiryHours = isRemembered ? 12 : PLATFORM_ABSOLUTE_TIMEOUT_HOURS;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    const recordedDevice = isRemembered && !deviceInfo?.includes('[remember_device]')
      ? `${deviceInfo || 'Platform Operator Console'} [remember_device]`
      : (deviceInfo || 'Platform Operator Console');

    await this.db.query(
      `INSERT INTO platform_sessions (id, admin_id, family_id, token_hash, device_info, ip_address, user_agent, last_active_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp(), $8)`,
      [
        generateUuidV7(),
        admin.id,
        familyId,
        tokenHash,
        recordedDevice,
        ipAddress || '127.0.0.1',
        userAgent || null,
        expiresAt,
      ],
    );

    return {
      accessToken,
      refreshToken: `${admin.id}.${familyId}.${rawSecret}`,
      expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      familyId,
    };
  }

  async rotatePlatformRefreshToken(
    rawCombinedToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; admin: PlatformAdminUser }> {
    const parts = rawCombinedToken.split('.');
    if (parts.length < 3) {
      throw new UnauthorizedException('Malformed platform refresh token');
    }
    const [adminId, familyId, rawSecret] = parts;
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const res = await this.db.query(
      `SELECT ps.id, ps.admin_id, ps.family_id, ps.expires_at, ps.revoked_at, ps.device_info, ps.last_active_at,
              pa.username, pa.full_name, pa.email, pa.role, pa.is_active, pa.token_version
       FROM platform_sessions ps
       JOIN platform_admins pa ON pa.id = ps.admin_id
       WHERE ps.token_hash = $1 AND ps.admin_id = $2`,
      [tokenHash, adminId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Invalid platform refresh token');
    }

    const row = res.rows[0];

    if (row.revoked_at) {
      this.logger.error(
        `🚨 SECURITY ALERT: Platform refresh token reuse detected for operator ${adminId}! Revoking family ${familyId}`,
      );
      await this.db.query(
        `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE family_id = $1`,
        [familyId],
      );
      throw new UnauthorizedException('Platform session compromised: token reuse detected');
    }

    if (new Date(row.expires_at) < new Date()) {
      throw new UnauthorizedException('Platform session expired');
    }

    // Idle session timeout check (30 minutes) if remember_device is not set
    const isRemembered = row.device_info?.includes('[remember_device]');
    if (!isRemembered && row.last_active_at) {
      const idleMs = Date.now() - new Date(row.last_active_at).getTime();
      if (idleMs > PLATFORM_IDLE_TIMEOUT_MINUTES * 60 * 1000) {
        await this.db.query(
          `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE id = $1`,
          [row.id],
        );
        throw new UnauthorizedException('Platform session expired due to inactivity (30m idle timeout)');
      }
    }

    if (!row.is_active) {
      throw new UnauthorizedException('Platform admin account is inactive');
    }

    // Revoke current token
    await this.db.query(
      `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE id = $1`,
      [row.id],
    );

    const adminUser: PlatformAdminUser = {
      id: row.admin_id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      role: row.role,
      tokenVersion: row.token_version,
    };

    const nextSession = await this.createPlatformSessionTokens(
      adminUser,
      row.device_info,
      ipAddress,
      userAgent,
      familyId,
    );

    return {
      accessToken: nextSession.accessToken,
      refreshToken: nextSession.refreshToken,
      expiresIn: nextSession.expiresIn,
      admin: adminUser,
    };
  }

  async listPlatformSessions(adminId: string, currentSessionFamilyId?: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT id, admin_id, family_id, device_info, ip_address, user_agent, created_at, last_active_at, expires_at, revoked_at
       FROM platform_sessions
       WHERE admin_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()
       ORDER BY last_active_at DESC`,
      [adminId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      deviceInfo: row.device_info || 'Platform Operator Console',
      ipAddress: row.ip_address || '127.0.0.1',
      userAgent: row.user_agent || null,
      createdAt: new Date(row.created_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      isCurrent: currentSessionFamilyId ? row.family_id === currentSessionFamilyId : false,
    }));
  }

  async revokePlatformSession(adminId: string, sessionId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE id = $1 AND admin_id = $2 AND revoked_at IS NULL RETURNING id`,
      [sessionId, adminId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async revokeAllPlatformSessions(adminId: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE admin_id = $1 AND revoked_at IS NULL`,
        [adminId],
      );
      await client.query(
        `UPDATE platform_admins SET token_version = token_version + 1 WHERE id = $1`,
        [adminId],
      );
    });
  }

  /**
   * Helper: Log security alerts
   */
  private async logSecurityAlert(
    tenantId: string | null,
    userId: string,
    action: string,
    ipAddress?: string,
    details?: any,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_name, entity_id, ip_address, result, details)
         VALUES ($1, $2, $3, $4, 'security_alert', $3, $5, 'LOCKOUT', $6)`,
        [generateUuidV7(), tenantId, userId, action, ipAddress || '127.0.0.1', JSON.stringify(details || {})],
      );
    } catch {}
  }
}

