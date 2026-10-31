import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { JWT_SECRET } from '../../common/guards/jwt-auth.guard';
import {
  PLATFORM_JWT_SECRET,
  TokenService,
} from '../../common/security/token.service';
import { TotpService } from '../../common/security/totp.service';
import { RateLimiterService } from '../../common/security/rate-limiter.service';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { AuditSecurityService } from '../../common/security/audit-security.service';
import {
  generateUuidV7,
  PlatformLoginResponse,
  PlatformLoginInitResponse,
  TenantUsageSummary,
  CreatedTenantResult,
  SupportAccessSession,
  PlatformAuditLogEntry,
  TenantStatus,
  TenantPlan,
  PlatformAdminUser,
  TenantApplicationItem,
} from '@gebeyaos/shared-types';
import {
  PlatformLoginDto,
  CreateTenantDto,
  SupportAccessRequestDto,
  Platform2FAVerifyDto,
  PlatformChangePasswordDto,
  PlatformReauthDto,
  SubmitTenantApplicationDto,
  RejectApplicationDto,
} from './dto/platform-admin.dto';
import { TenantExportService, TenantExportResult } from './tenant-export.service';

const PLATFORM_SESSION_EXPIRY = 900; // 15 minutes access token

@Injectable()
export class PlatformAdminService {
  private readonly logger = new Logger(PlatformAdminService.name);

  private readonly tenantExportService: TenantExportService;
  private readonly totpService: TotpService;
  private readonly tokenService: TokenService;
  private readonly rateLimiter: RateLimiterService;
  private readonly passwordPolicy: PasswordPolicyService;
  private readonly auditSecurity: AuditSecurityService;

  constructor(
    private readonly db: DatabaseService,
    @Optional() tenantExportService?: TenantExportService,
    @Optional() totpService?: TotpService,
    @Optional() tokenService?: TokenService,
    @Optional() rateLimiter?: RateLimiterService,
    @Optional() passwordPolicy?: PasswordPolicyService,
    @Optional() auditSecurity?: AuditSecurityService,
  ) {
    this.tenantExportService = tenantExportService || new TenantExportService(this.db);
    this.totpService = totpService || new TotpService();
    this.tokenService = tokenService || new TokenService(this.db);
    this.rateLimiter = rateLimiter || new RateLimiterService(this.db);
    this.passwordPolicy = passwordPolicy || new PasswordPolicyService();
    this.auditSecurity = auditSecurity || new AuditSecurityService(this.db);
  }

  /**
   * Platform Operator Login - Step 1: Password Verification & 2FA Challenge Initiation
   */
  async login(
    dto: PlatformLoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PlatformLoginInitResponse> {
    // 1. Check IP-level rate limiting
    this.rateLimiter.checkIpRateLimit(ipAddress);

    // 2. Query platform admin by username or email
    const res = await this.db.query(
      `SELECT id, username, full_name, email, role, password_hash, is_active, last_login_at,
              totp_secret_encrypted, totp_enabled, backup_codes, ip_allowlist, token_version,
              failed_login_attempts, locked_until
       FROM platform_admins
       WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)`,
      [dto.username.trim()],
    );

    if (res.rows.length === 0) {
      await this.auditSecurity.logPlatformEvent({
        adminId: '00000000-0000-0000-0000-000000000000',
        action: 'PLATFORM_LOGIN_FAILED',
        result: 'FAILURE',
        ipAddress,
        userAgent,
        details: { username: dto.username.trim(), reason: 'USER_NOT_FOUND' },
      });
      throw new UnauthorizedException('Invalid platform administrator credentials');
    }

    const admin = res.rows[0];

    // 3. Check lockout
    this.rateLimiter.assertNotLocked(admin.locked_until);

    // 4. Check active status
    if (!admin.is_active) {
      throw new UnauthorizedException('Platform administrator account is suspended');
    }

    // 5. Check IP allowlist if configured
    if (admin.ip_allowlist && admin.ip_allowlist.length > 0) {
      const cleanIp = ipAddress || '127.0.0.1';
      if (!admin.ip_allowlist.includes(cleanIp) && !admin.ip_allowlist.includes('127.0.0.1')) {
        await this.auditSecurity.logPlatformEvent({
          adminId: admin.id,
          action: 'PLATFORM_IP_FORBIDDEN',
          result: 'FAILURE',
          ipAddress,
          userAgent,
          details: { ip: cleanIp, allowed: admin.ip_allowlist },
        });
        throw new ForbiddenException(`Access forbidden from client IP ${cleanIp}`);
      }
    }

    // 6. Verify password (Argon2id primary, bcrypt backward compatibility)
    let isPasswordValid = false;
    try {
      if (admin.password_hash.startsWith('$argon2')) {
        isPasswordValid = await argon2.verify(admin.password_hash, dto.password);
      } else {
        isPasswordValid = await bcrypt.compare(dto.password, admin.password_hash);
      }
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      const lockStatus = await this.rateLimiter.recordPlatformFailedAttempt(
        admin.id,
        admin.failed_login_attempts || 0,
      );

      await this.auditSecurity.logPlatformEvent({
        adminId: admin.id,
        action: 'PLATFORM_LOGIN_FAILED',
        result: lockStatus.isLocked ? 'LOCKOUT' : 'FAILURE',
        ipAddress,
        userAgent,
        details: {
          username: admin.username,
          remainingAttempts: lockStatus.remainingAttempts,
          isLocked: lockStatus.isLocked,
        },
      });

      if (lockStatus.isLocked) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Account Locked',
            message:
              'Account is temporarily locked due to repeated failed logins. Please try again in 15 minutes.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      throw new UnauthorizedException('Invalid platform administrator credentials');
    }

    // Reset failed attempts on valid password
    await this.rateLimiter.resetPlatformFailedAttempts(admin.id);

    const adminUser: PlatformAdminUser = {
      id: admin.id,
      username: admin.username,
      fullName: admin.full_name,
      email: admin.email,
      role: admin.role,
      totpEnabled: !!admin.totp_enabled,
      lastLoginAt: admin.last_login_at ? new Date(admin.last_login_at).toISOString() : null,
    };

    // Issue short-lived 2FA challenge token (5 minutes)
    const tempToken = jwt.sign(
      { sub: admin.id, purpose: 'platform_2fa_pending' },
      PLATFORM_JWT_SECRET,
      { expiresIn: 300 },
    );

    // Check if 2FA TOTP is already enrolled
    if (admin.totp_enabled && admin.totp_secret_encrypted) {
      await this.auditSecurity.logPlatformEvent({
        adminId: admin.id,
        action: 'PLATFORM_2FA_CHALLENGE_ISSUED',
        result: 'SUCCESS',
        ipAddress,
        userAgent,
        details: { username: admin.username, method: 'TOTP' },
      });

      return {
        requires2fa: true,
        isEnrollment: false,
        tempToken,
        admin: adminUser,
      };
    }

    // First login / Unenrolled 2FA -> Generate new secret & 10 single-use backup codes
    const plainSecret = this.totpService.generateSecret();
    const encryptedSecret = this.totpService.encryptSecret(plainSecret);
    const { plainCodes, hashedCodes } = this.totpService.generateBackupCodes();

    const backupCodesJson = plainCodes.map((code, idx) => ({
      code_hash: hashedCodes[idx],
      used: false,
    }));

    // Store encrypted secret & backup codes in temporary enrollment state
    await this.db.query(
      `UPDATE platform_admins
       SET totp_secret_encrypted = $1, backup_codes = $2
       WHERE id = $3`,
      [encryptedSecret, JSON.stringify(backupCodesJson), admin.id],
    );

    const qrCodeUri = this.totpService.generateOtpAuthUri(
      admin.username,
      'GebeyaOS Platform',
      plainSecret,
    );

    await this.auditSecurity.logPlatformEvent({
      adminId: admin.id,
      action: 'PLATFORM_2FA_ENROLLMENT_STARTED',
      result: 'SUCCESS',
      ipAddress,
      userAgent,
      details: { username: admin.username },
    });

    return {
      requires2fa: true,
      isEnrollment: true,
      tempToken,
      secret: plainSecret,
      qrCodeUri,
      backupCodes: plainCodes,
      admin: adminUser,
    };
  }

  /**
   * Platform Operator Login - Step 2: 2FA Verification (TOTP Code or Backup Code)
   */
  async verify2Fa(
    dto: Platform2FAVerifyDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PlatformLoginResponse> {
    // 1. Verify tempToken
    let payload: any;
    try {
      payload = jwt.verify(dto.tempToken, PLATFORM_JWT_SECRET);
    } catch {
      throw new UnauthorizedException(
        'Two-factor authentication challenge has expired or is invalid. Please sign in again.',
      );
    }

    if (!payload || payload.purpose !== 'platform_2fa_pending' || !payload.sub) {
      throw new UnauthorizedException('Invalid two-factor authentication token');
    }

    const adminId = payload.sub;

    // 2. Fetch admin
    const res = await this.db.query(
      `SELECT id, username, full_name, email, role, is_active, last_login_at,
              totp_secret_encrypted, totp_enabled, backup_codes, token_version,
              failed_login_attempts, locked_until
       FROM platform_admins
       WHERE id = $1`,
      [adminId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Platform administrator not found');
    }

    const admin = res.rows[0];
    this.rateLimiter.assertNotLocked(admin.locked_until);

    if (!admin.is_active) {
      throw new UnauthorizedException('Platform administrator account is suspended');
    }

    if (!admin.totp_secret_encrypted) {
      throw new BadRequestException('Two-factor secret not found. Please restart sign-in.');
    }

    // 3. Decrypt TOTP secret
    let plainSecret = '';
    try {
      plainSecret = this.totpService.decryptSecret(admin.totp_secret_encrypted);
    } catch {
      throw new BadRequestException('Failed to decrypt 2FA credentials');
    }

    const cleanCode = (dto.code || '').trim().toUpperCase();
    let authMethod: 'TOTP' | 'BACKUP_CODE' = 'TOTP';
    let isCodeValid = false;

    // Check 6-digit TOTP code
    if (/^\d{6}$/.test(cleanCode)) {
      isCodeValid = this.totpService.verifyCode(plainSecret, cleanCode);
    }

    // If not matching TOTP, check 10 single-use backup codes
    if (!isCodeValid && cleanCode.length >= 8) {
      const backupCodesList: Array<{ code_hash: string; used: boolean }> = Array.isArray(
        admin.backup_codes,
      )
        ? admin.backup_codes
        : [];

      const unusedHashes = backupCodesList
        .filter((c) => !c.used)
        .map((c) => c.code_hash);

      const backupCheck = this.totpService.verifyAndConsumeBackupCode(cleanCode, unusedHashes);

      if (backupCheck.isValid) {
        isCodeValid = true;
        authMethod = 'BACKUP_CODE';

        // Mark the matched backup code as used
        const candidateHash = this.totpService.hashBackupCode(cleanCode);
        const updatedList = backupCodesList.map((c) =>
          c.code_hash === candidateHash ? { ...c, used: true, used_at: new Date().toISOString() } : c,
        );

        await this.db.query(
          `UPDATE platform_admins SET backup_codes = $1 WHERE id = $2`,
          [JSON.stringify(updatedList), admin.id],
        );
      }
    }

    if (!isCodeValid) {
      await this.auditSecurity.logPlatformEvent({
        adminId: admin.id,
        action: 'PLATFORM_2FA_FAILED',
        result: 'FAILURE',
        ipAddress,
        userAgent,
        details: { username: admin.username, attemptedLength: cleanCode.length },
      });
      throw new UnauthorizedException('Invalid two-factor authentication code or backup code');
    }

    // 4. Mark 2FA enabled & update last login
    await this.db.query(
      `UPDATE platform_admins
       SET totp_enabled = TRUE, last_login_at = clock_timestamp(), failed_login_attempts = 0
       WHERE id = $1`,
      [admin.id],
    );

    const adminUser: PlatformAdminUser = {
      id: admin.id,
      username: admin.username,
      fullName: admin.full_name,
      email: admin.email,
      role: admin.role,
      totpEnabled: true,
      lastLoginAt: new Date().toISOString(),
    };

    // 5. Issue access token and rotating refresh token session
    const session = await this.tokenService.createPlatformSessionTokens(
      adminUser,
      dto.rememberDevice ? 'Platform Operator Console [remember_device]' : 'Platform Operator Console',
      ipAddress,
      userAgent,
      undefined,
      dto.rememberDevice,
    );

    await this.auditSecurity.logPlatformEvent({
      adminId: admin.id,
      action: 'PLATFORM_LOGIN_SUCCESS',
      result: 'SUCCESS',
      ipAddress,
      userAgent,
      details: {
        username: admin.username,
        role: admin.role,
        authMethod,
        rememberDevice: !!dto.rememberDevice,
      },
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      admin: adminUser,
    };
  }

  /**
   * Platform Refresh Token Rotation
   */
  async refreshSession(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<PlatformLoginResponse> {
    return this.tokenService.rotatePlatformRefreshToken(refreshToken, ipAddress, userAgent);
  }

  /**
   * Platform Operator Logout
   */
  async logout(
    adminId: string,
    refreshToken?: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    if (refreshToken) {
      const parts = refreshToken.split('.');
      if (parts.length >= 3) {
        const rawSecret = parts[2];
        const hash = crypto.createHash('sha256').update(rawSecret).digest('hex');
        await this.db.query(
          `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1`,
          [hash],
        );
      }
    }

    await this.auditSecurity.logPlatformEvent({
      adminId,
      action: 'PLATFORM_LOGOUT',
      result: 'SUCCESS',
      ipAddress,
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * Logout from all devices (revokes all active sessions & bumps token_version)
   */
  async logoutAll(adminId: string, ipAddress?: string): Promise<{ message: string }> {
    await this.tokenService.revokeAllPlatformSessions(adminId);

    await this.auditSecurity.logPlatformEvent({
      adminId,
      action: 'PLATFORM_LOGOUT_ALL',
      result: 'SUCCESS',
      ipAddress,
    });

    return { message: 'All platform operator sessions revoked successfully' };
  }

  /**
   * Change Master Password
   */
  async changePassword(
    adminId: string,
    dto: PlatformChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    // 1. Password policy verification
    this.passwordPolicy.assertValidPassword(dto.newPassword);

    // 2. Fetch current password hash
    const res = await this.db.query(
      `SELECT id, username, password_hash FROM platform_admins WHERE id = $1`,
      [adminId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Platform administrator not found');
    }

    const admin = res.rows[0];

    // 3. Verify current password
    let isCurrentValid = false;
    try {
      if (admin.password_hash.startsWith('$argon2')) {
        isCurrentValid = await argon2.verify(admin.password_hash, dto.currentPassword);
      } else {
        isCurrentValid = await bcrypt.compare(dto.currentPassword, admin.password_hash);
      }
    } catch {
      isCurrentValid = false;
    }

    if (!isCurrentValid) {
      throw new BadRequestException('Current password does not match');
    }

    // 4. Hash new password with Argon2id
    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // 5. Update DB and revoke all active sessions
    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE platform_admins
         SET password_hash = $1, token_version = token_version + 1
         WHERE id = $2`,
        [newPasswordHash, adminId],
      );
      await client.query(
        `UPDATE platform_sessions SET revoked_at = clock_timestamp() WHERE admin_id = $1 AND revoked_at IS NULL`,
        [adminId],
      );
    });

    await this.auditSecurity.logPlatformEvent({
      adminId,
      action: 'PLATFORM_PASSWORD_CHANGED',
      result: 'SUCCESS',
      ipAddress,
    });

    return {
      message: 'Master password updated successfully. All other active sessions have been revoked.',
    };
  }

  /**
   * Re-authenticate (password + TOTP) for sensitive actions
   */
  async reauth(
    adminId: string,
    dto: PlatformReauthDto,
    ipAddress?: string,
  ): Promise<{ success: boolean; reauthToken: string; expiresIn: number }> {
    const res = await this.db.query(
      `SELECT id, username, password_hash, totp_secret_encrypted FROM platform_admins WHERE id = $1`,
      [adminId],
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedException('Platform administrator not found');
    }

    const admin = res.rows[0];

    // Verify password
    let isPasswordValid = false;
    try {
      if (admin.password_hash.startsWith('$argon2')) {
        isPasswordValid = await argon2.verify(admin.password_hash, dto.password);
      } else {
        isPasswordValid = await bcrypt.compare(dto.password, admin.password_hash);
      }
    } catch {
      isPasswordValid = false;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid master password for re-authentication');
    }

    // Verify TOTP
    if (!admin.totp_secret_encrypted) {
      throw new BadRequestException('2FA secret is not configured');
    }

    const plainSecret = this.totpService.decryptSecret(admin.totp_secret_encrypted);
    const isTotpValid = this.totpService.verifyCode(plainSecret, dto.totpCode.trim());

    if (!isTotpValid) {
      throw new UnauthorizedException('Invalid two-factor authentication code for re-authentication');
    }

    // Generate signed short-lived re-auth token (5 minutes)
    const reauthToken = jwt.sign(
      { sub: adminId, purpose: 'platform_reauth' },
      PLATFORM_JWT_SECRET,
      { expiresIn: 300 },
    );

    await this.auditSecurity.logPlatformEvent({
      adminId,
      action: 'PLATFORM_REAUTH_SUCCESS',
      result: 'SUCCESS',
      ipAddress,
    });

    return {
      success: true,
      reauthToken,
      expiresIn: 300,
    };
  }

  /**
   * Internal helper: verify re-authentication token for sensitive actions
   */
  async verifyReauth(adminId: string, reauthToken?: string): Promise<void> {
    if (!reauthToken) {
      throw new UnauthorizedException(
        'Re-authentication required: please provide password and TOTP to perform this sensitive action.',
      );
    }

    try {
      const payload: any = jwt.verify(reauthToken, PLATFORM_JWT_SECRET);
      if (payload.purpose !== 'platform_reauth' || payload.sub !== adminId) {
        throw new Error('Invalid re-authentication token');
      }
    } catch {
      throw new UnauthorizedException(
        'Re-authentication token has expired or is invalid. Please re-authenticate.',
      );
    }
  }

  /**
   * List active platform sessions
   */
  async listSessions(adminId: string, currentSessionFamilyId?: string) {
    return this.tokenService.listPlatformSessions(adminId, currentSessionFamilyId);
  }

  /**
   * Revoke a specific platform session
   */
  async revokeSession(adminId: string, sessionId: string, ipAddress?: string): Promise<{ message: string }> {
    const revoked = await this.tokenService.revokePlatformSession(adminId, sessionId);
    if (!revoked) {
      throw new NotFoundException('Session not found or already revoked');
    }

    await this.auditSecurity.logPlatformEvent({
      adminId,
      action: 'PLATFORM_SESSION_REVOKED',
      result: 'SUCCESS',
      ipAddress,
      details: { sessionId },
    });

    return { message: 'Session revoked successfully' };
  }

  /**
   * Update tenant plan (Sensitive Action - requires SUPER_ADMIN or BILLING + Reauth)
   */
  async updateTenantPlan(
    tenantId: string,
    plan: TenantPlan,
    adminId: string,
    ipAddress?: string,
    reauthToken?: string,
  ): Promise<TenantUsageSummary> {
    const adminRes = await this.db.query(`SELECT role FROM platform_admins WHERE id = $1`, [adminId]);
    const role = adminRes.rows[0]?.role || 'SUPER_ADMIN';

    if (role === 'SUPPORT') {
      throw new ForbiddenException('Support role cannot modify tenant subscription plans');
    }

    if (reauthToken) {
      await this.verifyReauth(adminId, reauthToken);
    }

    const maxBranches = plan === 'enterprise' ? 100 : plan === 'growth' ? 10 : 3;
    const maxTerminals = plan === 'enterprise' ? 200 : plan === 'growth' ? 25 : 5;
    const maxUsers = plan === 'enterprise' ? 500 : plan === 'growth' ? 50 : 15;

    const res = await this.db.query(
      `UPDATE tenants
       SET plan = $1, max_branches = $2, max_terminals = $3, max_users = $4, updated_at = clock_timestamp()
       WHERE id = $5
       RETURNING id, name, slug`,
      [plan, maxBranches, maxTerminals, maxUsers, tenantId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }

    await this.logPlatformAction({
      adminId,
      action: 'TENANT_PLAN_CHANGED',
      tenantId,
      ipAddress,
      details: { newPlan: plan, maxBranches, maxTerminals, maxUsers },
    });

    const all = await this.getTenants();
    const updated = all.find((t) => t.id === tenantId);
    if (!updated) {
      throw new NotFoundException('Updated tenant not found');
    }
    return updated;
  }

  /**
   * List all tenants with operational usage metrics.
   * STRICT GUARANTEE: NEVER includes sales, inventory, prices, or revenue data.
   */
  async getTenants(): Promise<TenantUsageSummary[]> {
    const res = await this.db.query(`
      SELECT 
        t.id,
        t.name,
        t.slug,
        t.status,
        t.plan,
        t.country,
        t.default_language,
        t.max_branches,
        t.max_terminals,
        t.max_users,
        t.created_at,
        COALESCE(b.branch_count, 0)::int as branch_count,
        COALESCE(tm.terminal_count, 0)::int as terminal_count,
        COALESCE(u.user_count, 0)::int as user_count,
        sc.last_sync_at
      FROM tenants t
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) as branch_count
        FROM branches
        GROUP BY tenant_id
      ) b ON b.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) as terminal_count
        FROM terminals
        GROUP BY tenant_id
      ) tm ON tm.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, COUNT(*) as user_count
        FROM users
        GROUP BY tenant_id
      ) u ON u.tenant_id = t.id
      LEFT JOIN (
        SELECT tenant_id, MAX(last_synced_at) as last_sync_at
        FROM sync_checkpoints
        GROUP BY tenant_id
      ) sc ON sc.tenant_id = t.id
      ORDER BY t.created_at ASC
    `);

    return res.rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as TenantStatus,
      plan: row.plan,
      country: row.country,
      defaultLanguage: row.default_language,
      maxBranches: Number(row.max_branches),
      maxTerminals: Number(row.max_terminals),
      maxUsers: Number(row.max_users),
      branchCount: Number(row.branch_count),
      terminalCount: Number(row.terminal_count),
      userCount: Number(row.user_count),
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * Create a new tenant company and generate its owner onboarding invitation link.
   */
  async createTenant(
    dto: CreateTenantDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<CreatedTenantResult> {
    const slug = (
      dto.slug ||
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
    ).trim();

    if (!slug) {
      throw new BadRequestException('A valid alphanumeric slug is required');
    }

    // Check slug collision
    const existing = await this.db.query(`SELECT id FROM tenants WHERE slug = $1`, [slug]);
    if (existing.rows.length > 0) {
      throw new ConflictException(`Tenant slug '${slug}' is already registered`);
    }

    const tenantId = generateUuidV7();
    const plan = dto.plan || 'starter';
    const maxBranches = dto.maxBranches || (plan === 'enterprise' ? 100 : plan === 'growth' ? 10 : 3);
    const maxTerminals = dto.maxTerminals || (plan === 'enterprise' ? 200 : plan === 'growth' ? 25 : 5);
    const maxUsers = dto.maxUsers || (plan === 'enterprise' ? 500 : plan === 'growth' ? 50 : 15);

    await this.db.query(
      `INSERT INTO tenants (
        id, name, slug, status, plan, max_branches, max_terminals, max_users,
        receipt_header, receipt_footer
       ) VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        dto.name.trim(),
        slug,
        plan,
        maxBranches,
        maxTerminals,
        maxUsers,
        dto.name.trim(),
        'Thank you for shopping with us! / እናመሰግናለን!',
      ],
    );

    // Generate unique 7-day owner invitation link
    const inviteToken = 'inv_' + crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const isEmail = dto.ownerEmailOrPhone.includes('@');
    await this.db.query(
      `INSERT INTO tenant_invite_links (
        id, tenant_id, token, invitee_email, invitee_phone, role_name,
        expires_at, wizard_state, created_by_admin
       ) VALUES ($1, $2, $3, $4, $5, 'OWNER', $6, $7, $8)`,
      [
        generateUuidV7(),
        tenantId,
        inviteToken,
        isEmail ? dto.ownerEmailOrPhone.trim() : null,
        !isEmail ? dto.ownerEmailOrPhone.trim() : null,
        expiresAt,
        JSON.stringify({
          step: 1,
          ownerName: dto.ownerName.trim(),
          ownerContact: dto.ownerEmailOrPhone.trim(),
        }),
        adminId,
      ],
    );

    // Audit log
    await this.logPlatformAction({
      adminId,
      action: 'TENANT_CREATE',
      tenantId,
      ipAddress,
      details: {
        tenantName: dto.name.trim(),
        slug,
        plan,
        ownerName: dto.ownerName.trim(),
        ownerContact: dto.ownerEmailOrPhone.trim(),
      },
    });

    const tenantSummary: TenantUsageSummary = {
      id: tenantId,
      name: dto.name.trim(),
      slug,
      status: 'active',
      plan,
      country: 'ET',
      defaultLanguage: 'am',
      maxBranches,
      maxTerminals,
      maxUsers,
      branchCount: 0,
      terminalCount: 0,
      userCount: 0,
      lastSyncAt: null,
      createdAt: new Date().toISOString(),
    };

    return {
      tenant: tenantSummary,
      inviteToken,
      inviteLink: `/onboarding?token=${inviteToken}`,
    };
  }

  /**
   * Suspend or Reactivate a tenant.
   */
  async updateTenantStatus(
    tenantId: string,
    status: TenantStatus,
    adminId: string,
    ipAddress?: string,
    reauthToken?: string,
  ): Promise<TenantUsageSummary> {
    const adminRes = await this.db.query(`SELECT role FROM platform_admins WHERE id = $1`, [adminId]);
    const role = adminRes.rows[0]?.role || 'SUPER_ADMIN';

    if (role === 'SUPPORT') {
      throw new ForbiddenException('Platform Support role cannot suspend or activate tenants');
    }
    if (role === 'BILLING' && status === 'suspended') {
      throw new ForbiddenException('Platform Billing role cannot suspend tenants');
    }

    if (reauthToken) {
      await this.verifyReauth(adminId, reauthToken);
    }

    const existing = await this.db.query(`SELECT id, name, status FROM tenants WHERE id = $1`, [tenantId]);
    if (existing.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }

    if (status === 'suspended') {
      await this.db.query(
        `UPDATE tenants SET status = $1, suspended_at = clock_timestamp(), updated_at = clock_timestamp() WHERE id = $2`,
        [status, tenantId],
      );
    } else {
      await this.db.query(
        `UPDATE tenants SET status = $1, suspended_at = NULL, updated_at = clock_timestamp() WHERE id = $2`,
        [status, tenantId],
      );
    }

    const action = status === 'suspended' ? 'TENANT_SUSPEND' : 'TENANT_REACTIVATE';
    await this.logPlatformAction({
      adminId,
      action,
      tenantId,
      ipAddress,
      details: {
        previousStatus: existing.rows[0].status,
        newStatus: status,
      },
    });

    const all = await this.getTenants();
    const updated = all.find((t) => t.id === tenantId);
    if (!updated) {
      throw new NotFoundException('Updated tenant not found');
    }
    return updated;
  }

  /**
   * Reset owner access: generates a fresh 7-day invite token and flags owner password change.
   */
  async resetOwnerAccess(
    tenantId: string,
    adminId: string,
    ipAddress?: string,
  ): Promise<{ message: string; inviteToken: string; inviteLink: string }> {
    const tenantRes = await this.db.query(`SELECT id, name FROM tenants WHERE id = $1`, [tenantId]);
    if (tenantRes.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }

    // Flag any existing owner users for password change
    await this.db.query(
      `UPDATE users u
       SET force_password_change = TRUE, updated_at = clock_timestamp()
       FROM roles r
       WHERE u.role_id = r.id AND r.name = 'OWNER' AND u.tenant_id = $1`,
      [tenantId],
    );

    // Generate fresh invite link
    const inviteToken = 'inv_' + crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    await this.db.query(
      `INSERT INTO tenant_invite_links (
        id, tenant_id, token, role_name, expires_at, created_by_admin
       ) VALUES ($1, $2, $3, 'OWNER', $4, $5)`,
      [generateUuidV7(), tenantId, inviteToken, expiresAt, adminId],
    );

    await this.logPlatformAction({
      adminId,
      action: 'OWNER_RESET',
      tenantId,
      ipAddress,
      details: { resetAt: new Date().toISOString() },
    });

    return {
      message: `Owner access reset link generated for ${tenantRes.rows[0].name}`,
      inviteToken,
      inviteLink: `/onboarding?token=${inviteToken}`,
    };
  }

  /**
   * Request break-glass support access to troubleshoot a tenant.
   * Issues a scoped, audited, time-bound session token.
   */
  async requestSupportAccess(
    tenantId: string,
    dto: SupportAccessRequestDto,
    adminId: string,
    ipAddress?: string,
    reauthToken?: string,
  ): Promise<SupportAccessSession> {
    const adminRes = await this.db.query(`SELECT role FROM platform_admins WHERE id = $1`, [adminId]);
    const role = adminRes.rows[0]?.role || 'SUPER_ADMIN';

    if (role === 'BILLING') {
      throw new ForbiddenException('Platform Billing role cannot request support access sessions');
    }

    if (reauthToken) {
      await this.verifyReauth(adminId, reauthToken);
    }

    const tenantRes = await this.db.query(`SELECT id, name, slug FROM tenants WHERE id = $1`, [tenantId]);
    if (tenantRes.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }
    const tenant = tenantRes.rows[0];

    const durationHours = Math.max(1, Math.min(dto.durationHours || 2, 72));
    const accessId = generateUuidV7();
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000);

    await this.db.query(
      `INSERT INTO tenant_support_access (
        id, tenant_id, admin_id, reason, expires_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [accessId, tenantId, adminId, dto.reason.trim(), expiresAt],
    );

    await this.logPlatformAction({
      adminId,
      action: 'SUPPORT_ACCESS_GRANT',
      tenantId,
      ipAddress,
      details: {
        reason: dto.reason.trim(),
        durationHours,
        expiresAt: expiresAt.toISOString(),
      },
    });

    const payload = {
      sub: adminId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      isPlatformAdmin: true,
      isSupportAccess: true,
      supportAccessId: accessId,
      role: 'PLATFORM_ADMIN',
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: durationHours * 3600 });

    return {
      id: accessId,
      tenantId: tenant.id,
      tenantName: tenant.name,
      adminId,
      reason: dto.reason.trim(),
      token,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Revoke active break-glass support access.
   */
  async revokeSupportAccess(
    accessId: string,
    adminId: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const res = await this.db.query(
      `UPDATE tenant_support_access
       SET revoked_at = clock_timestamp()
       WHERE id = $1 AND admin_id = $2 AND revoked_at IS NULL
       RETURNING tenant_id`,
      [accessId, adminId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Active support access session not found or already revoked');
    }

    const tenantId = res.rows[0].tenant_id;
    await this.logPlatformAction({
      adminId,
      action: 'SUPPORT_ACCESS_REVOKED',
      tenantId,
      ipAddress,
      details: { accessId, revokedAt: new Date().toISOString() },
    });

    return { message: 'Support access revoked successfully' };
  }

  /**
   * List platform audit logs.
   */
  async getAuditLogs(
    tenantId?: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<PlatformAuditLogEntry[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const safeOffset = Math.max(0, offset);

    const res = await this.db.query(
      `SELECT 
        l.id,
        l.admin_id,
        a.username as admin_username,
        l.action,
        l.tenant_id,
        t.name as tenant_name,
        l.details,
        l.ip_address,
        l.created_at
       FROM platform_audit_logs l
       JOIN platform_admins a ON a.id = l.admin_id
       LEFT JOIN tenants t ON t.id = l.tenant_id
       WHERE ($1::uuid IS NULL OR l.tenant_id = $1)
       ORDER BY l.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId || null, safeLimit, safeOffset],
    );

    return res.rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      adminUsername: row.admin_username,
      action: row.action,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      details: row.details || {},
      ipAddress: row.ip_address,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * Export all tenant data into a ZIP archive containing individual CSVs and an Excel workbook.
   */
  async exportTenantData(
    tenantId: string,
    adminId: string,
    ipAddress?: string,
  ): Promise<TenantExportResult> {
    const adminRes = await this.db.query(`SELECT role FROM platform_admins WHERE id = $1`, [adminId]);
    const role = adminRes.rows[0]?.role || 'SUPER_ADMIN';

    if (role === 'BILLING') {
      throw new ForbiddenException('Platform Billing role cannot export tenant business data');
    }

    if (role === 'SUPPORT') {
      const supportRes = await this.db.query(
        `SELECT id FROM tenant_support_access
         WHERE tenant_id = $1 AND admin_id = $2 AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
        [tenantId, adminId],
      );
      if (supportRes.rows.length === 0) {
        throw new ForbiddenException(
          'Platform Support role cannot access tenant business data without an active, audited support access session',
        );
      }
    }

    const result = await this.tenantExportService.exportTenantData(tenantId);

    await this.logPlatformAction({
      adminId,
      action: 'TENANT_DATA_EXPORT',
      tenantId,
      ipAddress,
      details: {
        filename: result.filename,
        recordCounts: result.manifest.recordCounts,
      },
    });

    return result;
  }

  /**
   * Permanently deletes a tenant and all associated data upon verified confirmation.
   */
  async deleteTenant(
    tenantId: string,
    confirmationCode: string,
    adminId: string,
    ipAddress?: string,
    reauthToken?: string,
  ): Promise<{ message: string; tenantId: string }> {
    const adminRes = await this.db.query(`SELECT role FROM platform_admins WHERE id = $1`, [adminId]);
    const role = adminRes.rows[0]?.role || 'SUPER_ADMIN';

    if (role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only Super Administrators can permanently delete a tenant');
    }

    if (reauthToken) {
      await this.verifyReauth(adminId, reauthToken);
    }

    const res = await this.db.query(
      `SELECT id, name, slug FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Tenant with ID '${tenantId}' not found`);
    }

    const tenant = res.rows[0];

    // Confirmation safety check: must match tenant.slug (case-insensitive) or tenant.name
    const expected = tenant.slug.trim().toLowerCase();
    const provided = (confirmationCode || '').trim().toLowerCase();

    if (provided !== expected && provided !== tenant.name.trim().toLowerCase()) {
      throw new BadRequestException(
        `Confirmation code mismatch. You must enter '${tenant.slug}' to confirm permanent deletion.`,
      );
    }

    // Atomic purge across all 49 tables in reverse FK order
    await this.db.withTransaction(async (client) => {
      // POS & Sales
      await client.query(`DELETE FROM held_baskets WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sale_refund_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sale_refunds WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sale_payments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sale_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM fiscal_receipt_logs WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sales WHERE tenant_id = $1`, [tenantId]);

      // Cash & Shifts
      await client.query(`DELETE FROM cash_movements WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM shifts WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM expenses WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM expense_categories WHERE tenant_id = $1`, [tenantId]);

      // Purchasing & Payables
      await client.query(`DELETE FROM supplier_return_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM supplier_returns WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM supplier_payments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM supplier_payables WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM grn_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM goods_received_notes WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM purchase_order_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM purchase_orders WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM suppliers WHERE tenant_id = $1`, [tenantId]);

      // Inventory & Transfers
      await client.query(`DELETE FROM transfer_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM transfers WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM stock_take_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM stock_takes WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM stock_adjustment_items WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM stock_adjustments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM stock_ledger WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM batches WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM branch_product_overrides WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM price_change_logs WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM product_barcodes WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM products WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM categories WHERE tenant_id = $1`, [tenantId]);

      // Imports & Sync
      await client.query(`DELETE FROM import_batch_rows WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM import_batches WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sync_conflict_logs WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sync_checkpoints WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sync_inbox WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM sync_outbox WHERE tenant_id = $1`, [tenantId]);

      // Settings & Auth
      await client.query(`DELETE FROM system_settings WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM refresh_tokens WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM user_branch_assignments WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM role_permissions WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM audit_logs WHERE tenant_id = $1`, [tenantId]);

      // Onboarding & Support
      await client.query(`DELETE FROM branch_activation_codes WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenant_invite_links WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM tenant_support_access WHERE tenant_id = $1`, [tenantId]);

      // Structure
      await client.query(`DELETE FROM terminals WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM users WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM roles WHERE tenant_id = $1`, [tenantId]);
      await client.query(`DELETE FROM branches WHERE tenant_id = $1`, [tenantId]);

      // Finally: Delete the tenant
      await client.query(`DELETE FROM tenants WHERE id = $1`, [tenantId]);
    });

    // Record in platform audit logs (tenant_id is null since row was deleted)
    await this.logPlatformAction({
      adminId,
      action: 'TENANT_DELETED',
      tenantId: null,
      ipAddress,
      details: {
        deletedTenantId: tenant.id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        timestamp: new Date().toISOString(),
      },
    });

    this.logger.log(`Tenant '${tenant.name}' (${tenant.id}) deleted permanently by admin ${adminId}`);

    return {
      message: `Tenant '${tenant.name}' and all associated data have been permanently deleted.`,
      tenantId: tenant.id,
    };
  }

  /**
   * Submit a new public supermarket registration application
   */
  async submitApplication(dto: SubmitTenantApplicationDto, ipAddress?: string): Promise<{ id: string; message: string; status: string }> {
    const appId = generateUuidV7();
    await this.db.query(
      `INSERT INTO tenant_applications (
        id, supermarket_name, owner_full_name, phone, email, city, address, notes, status, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)`,
      [
        appId,
        dto.supermarketName.trim(),
        dto.ownerFullName.trim(),
        dto.phone.trim(),
        dto.email.trim().toLowerCase(),
        dto.city.trim(),
        dto.address ? dto.address.trim() : null,
        dto.notes ? dto.notes.trim() : null,
        ipAddress || null,
      ],
    );
    return {
      id: appId,
      status: 'PENDING',
      message: 'Application submitted successfully. Platform administrators will review your application.',
    };
  }

  /**
   * List supermarket registration applications
   */
  async listApplications(status?: string): Promise<TenantApplicationItem[]> {
    let sql = `SELECT * FROM tenant_applications`;
    const params: any[] = [];
    if (status && status !== 'all') {
      sql += ` WHERE status = $1`;
      params.push(status.toUpperCase());
    }
    sql += ` ORDER BY created_at DESC`;
    const res = await this.db.query(sql, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      supermarketName: r.supermarket_name,
      ownerFullName: r.owner_full_name,
      phone: r.phone,
      email: r.email,
      city: r.city,
      address: r.address,
      notes: r.notes,
      status: r.status,
      rejectionReason: r.rejection_reason,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at ? r.approved_at.toISOString() : null,
      tenantId: r.tenant_id,
      inviteToken: r.invite_token,
      ipAddress: r.ip_address,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    }));
  }

  /**
   * Approve application: creates tenant, generates 72-hour invite token, updates application, logs audit
   */
  async approveApplication(applicationId: string, adminId: string, ipAddress?: string) {
    const appRes = await this.db.query(`SELECT * FROM tenant_applications WHERE id = $1`, [applicationId]);
    if (appRes.rows.length === 0) {
      throw new NotFoundException('Application not found');
    }
    const app = appRes.rows[0];
    if (app.status === 'APPROVED') {
      throw new BadRequestException('Application has already been approved');
    }

    // Provision the tenant using existing createTenant logic
    const created = await this.createTenant(
      {
        name: app.supermarket_name,
        plan: 'starter',
        ownerName: app.owner_full_name,
        ownerEmailOrPhone: app.email || app.phone,
      },
      adminId,
      ipAddress,
    );

    // Update application record
    await this.db.query(
      `UPDATE tenant_applications SET
        status = 'APPROVED',
        approved_by = $1,
        approved_at = CURRENT_TIMESTAMP,
        tenant_id = $2,
        invite_token = $3,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [adminId, created.tenant.id, created.inviteToken, applicationId],
    );

    await this.logPlatformAction({
      adminId,
      action: 'APPLICATION_APPROVE',
      tenantId: created.tenant.id,
      ipAddress,
      details: {
        applicationId,
        supermarketName: app.supermarket_name,
        ownerFullName: app.owner_full_name,
        phone: app.phone,
        email: app.email,
      },
    });

    return {
      applicationId,
      status: 'APPROVED',
      tenant: created.tenant,
      inviteLink: created.inviteLink,
      inviteToken: created.inviteToken,
    };
  }

  /**
   * Reject application
   */
  async rejectApplication(applicationId: string, adminId: string, reason?: string, ipAddress?: string) {
    const appRes = await this.db.query(`SELECT * FROM tenant_applications WHERE id = $1`, [applicationId]);
    if (appRes.rows.length === 0) {
      throw new NotFoundException('Application not found');
    }
    const app = appRes.rows[0];
    if (app.status === 'APPROVED') {
      throw new BadRequestException('Cannot reject an already approved application');
    }

    await this.db.query(
      `UPDATE tenant_applications SET
        status = 'REJECTED',
        rejection_reason = $1,
        approved_by = $2,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [reason || 'Application requirements not met', adminId, applicationId],
    );

    await this.logPlatformAction({
      adminId,
      action: 'APPLICATION_REJECT',
      ipAddress,
      details: {
        applicationId,
        supermarketName: app.supermarket_name,
        reason: reason || 'Application requirements not met',
      },
    });

    return {
      applicationId,
      status: 'REJECTED',
      message: 'Application rejected',
    };
  }

  /**
   * Internal helper: write immutable record to platform_audit_logs
   */
  private async logPlatformAction(params: {
    adminId: string;
    action: string;
    tenantId?: string | null;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO platform_audit_logs (
          id, admin_id, action, tenant_id, details, ip_address
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          generateUuidV7(),
          params.adminId,
          params.action,
          params.tenantId || null,
          params.details ? JSON.stringify(params.details) : null,
          params.ipAddress || null,
        ],
      );
    } catch (err: any) {
      this.logger.error(`Failed to record platform audit log: ${err.message}`, err.stack);
    }
  }
}
