import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { PasswordPolicyService } from '../../common/security/password-policy.service';
import { PinHasherService } from '../../common/security/pin-hasher.service';
import { TotpService } from '../../common/security/totp.service';
import { TokenService } from '../../common/security/token.service';
import { RateLimiterService } from '../../common/security/rate-limiter.service';
import { AuditSecurityService } from '../../common/security/audit-security.service';
import {
  SetupWizardDto,
  LoginDto,
  PinLoginDto,
  ChangePasswordDto,
  ChangePinDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
  TerminalPairDto,
  ManagerOverrideDto,
} from './dto/auth.dto';
import {
  LoginResponse,
  AuthenticatedUser,
  SetupStatusResponse,
  generateUuidV7,
  UserSessionInfo,
  CashierSummary,
  TerminalPairResponse,
  ManagerOverrideResult,
} from '@gebeyaos/shared-types';
import { DEFAULT_TENANT_ID } from '../../common/guards/jwt-auth.guard';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly passwordPolicy: PasswordPolicyService;
  private readonly pinHasher: PinHasherService;
  private readonly totp: TotpService;
  private readonly tokenSvc: TokenService;
  private readonly rateLimiter: RateLimiterService;
  private readonly auditSecurity: AuditSecurityService;

  constructor(
    private readonly db: DatabaseService,
    @Optional() passwordPolicyService?: PasswordPolicyService,
    @Optional() pinHasherService?: PinHasherService,
    @Optional() totpService?: TotpService,
    @Optional() tokenService?: TokenService,
    @Optional() rateLimiterService?: RateLimiterService,
    @Optional() auditSecurityService?: AuditSecurityService,
  ) {
    this.passwordPolicy = passwordPolicyService || new PasswordPolicyService();
    this.pinHasher = pinHasherService || new PinHasherService();
    this.totp = totpService || new TotpService();
    this.tokenSvc = tokenService || new TokenService(this.db);
    this.rateLimiter = rateLimiterService || new RateLimiterService(this.db);
    this.auditSecurity = auditSecurityService || new AuditSecurityService(this.db);
  }

  /**
   * Helper: Hash password using Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    return this.passwordPolicy.hashPassword(password);
  }

  /**
   * Helper: Verify password with Argon2id, with bcrypt fallback
   */
  async verifyPassword(storedHash: string | null | undefined, candidate: string): Promise<boolean> {
    return this.passwordPolicy.verifyPassword(storedHash, candidate);
  }

  /**
   * 1. First-Run Setup Status (only when tenant has 0 users)
   */
  async getSetupStatus(tenantId: string = DEFAULT_TENANT_ID): Promise<SetupStatusResponse> {
    const settingsRes = await this.db.query(
      `SELECT value FROM system_settings WHERE key = 'setup_completed'`,
      undefined,
      tenantId,
    );

    const userCountRes = await this.db.query(
      `SELECT count(*)::int as count FROM users WHERE is_active = true`,
      undefined,
      tenantId,
    );

    const userCount = userCountRes.rows[0]?.count || 0;
    const isCompleted = settingsRes.rows.length > 0 && settingsRes.rows[0].value?.completed;

    if (isCompleted || userCount > 0) {
      const branchRes = await this.db.query(
        `SELECT code, name FROM branches WHERE is_hq = true LIMIT 1`,
        undefined,
        tenantId,
      );
      return {
        setupCompleted: true,
        storeName: branchRes.rows[0]?.name || 'Gebeya Supermarket',
        ownerExists: true,
        defaultBranchCode: branchRes.rows[0]?.code || 'BOLE-01',
      };
    }

    return {
      setupCompleted: false,
      ownerExists: false,
    };
  }

  /**
   * Execute First-Run Owner Setup Wizard (Locks Permanently)
   */
  async executeSetup(
    dto: SetupWizardDto,
    ipAddress?: string,
    userAgent?: string,
    targetTenantId: string = DEFAULT_TENANT_ID,
  ): Promise<LoginResponse> {
    const status = await this.getSetupStatus(targetTenantId);
    if (status.setupCompleted || status.ownerExists) {
      throw new ForbiddenException(
        'System setup has already been completed and is permanently locked. Sign in with owner credentials.',
      );
    }

    // Enforce password policy
    this.passwordPolicy.assertValidPassword(dto.ownerPassword);
    this.pinHasher.assertValidPin(dto.ownerPin);

    return this.db.withTransaction(async (client) => {
      const branchId = generateUuidV7();
      await client.query(
        `INSERT INTO branches (id, tenant_id, code, name, trade_name, tin_number, phone, is_hq, settings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
         ON CONFLICT (tenant_id, code) DO UPDATE SET
            name = EXCLUDED.name,
            trade_name = EXCLUDED.trade_name,
            tin_number = EXCLUDED.tin_number,
            settings = EXCLUDED.settings`,
        [
          branchId,
          targetTenantId,
          dto.branchCode.toUpperCase().trim(),
          dto.companyName.trim(),
          dto.tradeName || dto.companyName.trim(),
          dto.tinNumber.trim(),
          dto.ownerPhone.trim(),
          JSON.stringify({
            currency: dto.currency || 'ETB',
            default_vat_rate: dto.defaultVatRate || 0.15,
            language: dto.language || 'en',
            receipt_header: dto.receiptHeader || dto.companyName,
            receipt_footer: dto.receiptFooter || 'Thank you for shopping with us! / እናመሰግናለን!',
          }),
        ],
      );

      const roleRes = await client.query(
        `SELECT id FROM roles WHERE name = 'OWNER' LIMIT 1`,
      );
      if (roleRes.rows.length === 0) {
        throw new NotFoundException('OWNER role is missing in system roles.');
      }
      const ownerRoleId = roleRes.rows[0].id;

      // Hash credentials
      const passwordHash = await this.hashPassword(dto.ownerPassword);
      const pinSalt = this.pinHasher.generateSalt();
      const pinHash = await this.pinHasher.hashPin(dto.ownerPin, pinSalt);
      const ownerId = generateUuidV7();

      await client.query(
        `INSERT INTO users (id, tenant_id, username, full_name, phone, password_hash, pin_hash, pin_salt, role_id, default_branch_id, is_active, token_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, 1)`,
        [
          ownerId,
          targetTenantId,
          dto.ownerUsername.toLowerCase().trim(),
          dto.ownerFullName.trim(),
          dto.ownerPhone.trim(),
          passwordHash,
          pinHash,
          pinSalt,
          ownerRoleId,
          branchId,
        ],
      );

      await client.query(
        `INSERT INTO user_branch_assignments (user_id, branch_id, tenant_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [ownerId, branchId, targetTenantId],
      );

      // Lock setup permanently
      await client.query(
        `INSERT INTO system_settings (tenant_id, key, value)
         VALUES ($1, 'setup_completed', $2)
         ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
        [
          targetTenantId,
          JSON.stringify({
            completed: true,
            completedAt: new Date().toISOString(),
            companyName: dto.companyName,
            branchCode: dto.branchCode,
            currency: dto.currency || 'ETB',
            defaultVatRate: dto.defaultVatRate || 0.15,
          }),
        ],
      );

      await this.auditSecurity.logAuthEvent({
        tenantId: targetTenantId,
        branchId,
        userId: ownerId,
        action: 'SETUP_WIZARD_COMPLETED',
        entityName: 'system_settings',
        ipAddress,
        userAgent,
        result: 'SUCCESS',
        details: { company: dto.companyName, owner: dto.ownerUsername },
      });

      const permsRes = await client.query(
        `SELECT permission_id FROM role_permissions WHERE role_id = $1`,
        [ownerRoleId],
      );
      const permissions = permsRes.rows.map((r: any) => r.permission_id);

      const authUser: AuthenticatedUser = {
        id: ownerId,
        tenantId: targetTenantId,
        tenantSlug: 'kerod',
        tenantName: dto.companyName.trim(),
        username: dto.ownerUsername.toLowerCase().trim(),
        fullName: dto.ownerFullName.trim(),
        phone: dto.ownerPhone.trim(),
        role: 'OWNER',
        roleId: ownerRoleId,
        branchId,
        branchCode: dto.branchCode.toUpperCase().trim(),
        branchName: dto.companyName.trim(),
        permissions,
        forcePasswordChange: false,
      };

      const tokens = await this.tokenSvc.createTenantSessionTokens(authUser, 'Setup Wizard', ipAddress, userAgent);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        user: authUser,
      };
    });
  }

  /**
   * 2. Company Info Lookup (for step 1 of Back-Office Login)
   */
  async getCompanyInfo(slug?: string) {
    let query = `SELECT id, name, slug, status, logo_url, receipt_header, receipt_footer, default_language, plan, suspended_at, grace_period_days FROM tenants`;
    let params: any[] = [];

    if (slug && slug.trim()) {
      query += ` WHERE LOWER(slug) = LOWER($1) OR id::text = $1 LIMIT 1`;
      params.push(slug.trim());
    } else {
      query += ` ORDER BY created_at ASC LIMIT 1`;
    }

    const res = await this.db.query(query, params);
    if (res.rows.length === 0) {
      throw new NotFoundException('Supermarket company code not found');
    }

    const t = res.rows[0];
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      logoUrl: t.logo_url,
      receiptHeader: t.receipt_header,
      defaultLanguage: t.default_language,
      plan: t.plan,
      isSuspended: t.status === 'suspended',
    };
  }

  /**
   * 3. Back-Office Login (2-Step, Progressive Lockout, Argon2id, TOTP)
   */
  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResponse & { assignedBranches?: any[]; requires2FA?: boolean }> {
    // 1. IP Rate Limiting check
    this.rateLimiter.checkIpRateLimit(ipAddress);

    const identifier = dto.usernameOrPhone.trim();

    // 2. Identify target tenant
    let targetTenantId: string | null = null;
    if (dto.companyCode && dto.companyCode.trim()) {
      const tenantRes = await this.db.query(
        `SELECT id, status, suspended_at, grace_period_days FROM tenants WHERE LOWER(slug) = LOWER($1) OR id::text = $1 LIMIT 1`,
        [dto.companyCode.trim()],
      );
      if (tenantRes.rows.length === 0) {
        throw new UnauthorizedException('Invalid company code or credentials');
      }
      targetTenantId = tenantRes.rows[0].id;
    }

    // 3. Query user by username or phone
    let userQuery = `
       SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
              t.suspended_at, t.grace_period_days,
              u.username, u.full_name, u.email, u.phone, u.password_hash,
              u.pin_hash, u.pin_salt, u.role_id, r.name as role_name, u.default_branch_id,
              b.code as branch_code, b.name as branch_name,
              u.is_active, u.failed_login_attempts, u.locked_until,
              u.force_password_change, u.token_version, u.requires_totp, u.totp_secret_encrypted,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.default_branch_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE (LOWER(u.username) = LOWER($1) OR u.phone = $1)
    `;
    const params: any[] = [identifier];

    if (targetTenantId) {
      userQuery += ` AND u.tenant_id = $2`;
      params.push(targetTenantId);
    }

    userQuery += `
       GROUP BY u.id, u.tenant_id, t.name, t.slug, t.status, t.suspended_at, t.grace_period_days,
                u.username, u.full_name, u.email, u.phone, u.password_hash,
                u.pin_hash, u.pin_salt, u.role_id, r.name, u.default_branch_id, b.code, b.name,
                u.is_active, u.failed_login_attempts, u.locked_until, u.force_password_change,
                u.token_version, u.requires_totp, u.totp_secret_encrypted
    `;

    const res = await this.db.query(userQuery, params, targetTenantId || undefined);

    if (res.rows.length === 0) {
      await this.auditSecurity.logAuthEvent({
        tenantId: targetTenantId,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        result: 'FAILURE',
        details: { identifier, reason: 'User not found' },
      });
      // Generic error message: never reveal whether user exists
      throw new UnauthorizedException('Invalid credentials');
    }

    const row = res.rows[0];

    // 4. Check account lockout
    this.rateLimiter.assertNotLocked(row.locked_until);

    // 5. Check if user is active
    if (!row.is_active) {
      await this.auditSecurity.logAuthEvent({
        tenantId: row.tenant_id,
        userId: row.id,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        result: 'FAILURE',
        details: { reason: 'User inactive' },
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    // 6. Check tenant suspension
    if (row.tenant_status === 'suspended') {
      const suspendedAt = row.suspended_at ? new Date(row.suspended_at).getTime() : Date.now();
      const graceDays = row.grace_period_days || 14;
      const graceExpires = suspendedAt + graceDays * 24 * 60 * 60 * 1000;
      if (Date.now() > graceExpires) {
        throw new UnauthorizedException('This supermarket account is suspended. Please contact platform support.');
      }
    }

    // 7. Verify Password
    const isValid = await this.verifyPassword(row.password_hash, dto.password);
    if (!isValid) {
      const { isLocked, remainingAttempts, lockedUntil } = await this.rateLimiter.recordFailedAttempt(
        row.id,
        row.failed_login_attempts,
        row.tenant_id,
      );

      if (isLocked) {
        await this.auditSecurity.logAuthEvent({
          tenantId: row.tenant_id,
          branchId: row.default_branch_id,
          userId: row.id,
          action: 'USER_LOCKOUT',
          ipAddress,
          userAgent,
          result: 'LOCKOUT',
          details: { lockedUntil },
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Account Locked',
            message: `Too many failed login attempts. Your account is locked for 15 minutes.`,
            remainingSeconds: 15 * 60,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.auditSecurity.logAuthEvent({
        tenantId: row.tenant_id,
        branchId: row.default_branch_id,
        userId: row.id,
        action: 'LOGIN_FAILED',
        ipAddress,
        userAgent,
        result: 'FAILURE',
        details: { remainingAttempts },
      });

      throw new UnauthorizedException(
        `Invalid credentials. ${remainingAttempts} attempt(s) remaining before account lockout.`,
      );
    }

    // 8. Check Optional 2FA (TOTP)
    if (row.requires_totp && row.totp_secret_encrypted) {
      if (!dto.totpCode) {
        return {
          requires2FA: true,
          accessToken: '',
          refreshToken: '',
          expiresIn: 0,
          user: {
            id: row.id,
            tenantId: row.tenant_id,
            username: row.username,
            fullName: row.full_name,
            role: row.role_name,
            roleId: row.role_id,
            branchId: row.default_branch_id,
            permissions: [],
            forcePasswordChange: false,
          },
        };
      }

      const secret = this.totp.decryptSecret(row.totp_secret_encrypted);
      const isTotpValid = this.totp.verifyCode(secret, dto.totpCode);
      if (!isTotpValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    // 9. Successful Login: Reset failed attempts
    await this.rateLimiter.resetFailedAttempts(row.id, row.tenant_id);

    // Retrieve all branches assigned to user
    const branchRes = await this.db.query(
      `SELECT b.id, b.code, b.name, b.trade_name
       FROM branches b
       JOIN user_branch_assignments uba ON uba.branch_id = b.id
       WHERE uba.user_id = $1 AND b.tenant_id = $2`,
      [row.id, row.tenant_id],
      row.tenant_id,
    );

    const authUser: AuthenticatedUser = {
      id: row.id,
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

    const session = await this.tokenSvc.createTenantSessionTokens(
      authUser,
      'Web Back-Office',
      ipAddress,
      userAgent,
    );

    await this.auditSecurity.logAuthEvent({
      tenantId: row.tenant_id,
      branchId: authUser.branchId,
      userId: authUser.id,
      action: 'LOGIN_SUCCESS',
      ipAddress,
      userAgent,
      result: 'SUCCESS',
      details: { username: authUser.username, role: authUser.role },
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      user: authUser,
      assignedBranches: branchRes.rows,
    };
  }

  /**
   * 4a. Get Active Cashiers for Terminal Lock Screen Selection
   */
  async getCashiers(branchId?: string, tenantId?: string): Promise<CashierSummary[]> {
    let query = `
      SELECT u.id, u.username, u.full_name, u.phone, r.name as role_name,
             u.default_branch_id, u.pin_locked_until
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN user_branch_assignments uba ON uba.user_id = u.id
      WHERE u.is_active = TRUE AND u.pin_hash IS NOT NULL
        AND (r.name IN ('CASHIER', 'BRANCH_MANAGER', 'OWNER')
             OR EXISTS (
               SELECT 1 FROM role_permissions rp
               WHERE rp.role_id = r.id AND rp.permission_id IN ('pos:shift:open', 'pos:sale:create')
             ))
    `;
    const params: any[] = [];
    if (branchId) {
      params.push(branchId);
      query += ` AND (u.default_branch_id = $${params.length} OR uba.branch_id = $${params.length})`;
    }
    if (tenantId) {
      params.push(tenantId);
      query += ` AND u.tenant_id = $${params.length}`;
    }

    query += ` GROUP BY u.id, u.username, u.full_name, u.phone, r.name, u.default_branch_id, u.pin_locked_until ORDER BY u.full_name ASC`;

    const res = await this.db.query(query, params, tenantId || undefined);

    const now = Date.now();
    return res.rows.map((row: any) => {
      const isLocked = !!(row.pin_locked_until && new Date(row.pin_locked_until).getTime() > now);
      const lockRemainingSeconds = isLocked
        ? Math.max(0, Math.ceil((new Date(row.pin_locked_until).getTime() - now) / 1000))
        : 0;
      return {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        phone: row.phone,
        role: row.role_name,
        branchId: row.default_branch_id,
        isLocked,
        lockRemainingSeconds,
      };
    });
  }

  /**
   * 4b. Fast Cashier PIN Login (with per-user lockout, terminal binding, 12h expiry)
   */
  async pinLogin(dto: PinLoginDto, ipAddress?: string): Promise<LoginResponse> {
    this.rateLimiter.checkIpRateLimit(ipAddress);

    let matchedUser: any = null;

    if (dto.userId) {
      const userRes = await this.db.query(
        `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
                u.username, u.full_name, u.phone, u.pin_hash, u.pin_salt,
                u.pin_failed_attempts, u.pin_locked_until,
                u.role_id, r.name as role_name, u.default_branch_id,
                b.code as branch_code, b.name as branch_name,
                u.is_active, u.force_password_change, u.locked_until,
                COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN branches b ON b.id = u.default_branch_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE u.id = $1 AND u.is_active = true AND u.pin_hash IS NOT NULL
         GROUP BY u.id, u.tenant_id, t.name, t.slug, u.username, u.full_name, u.phone, u.pin_hash, u.pin_salt,
                  u.pin_failed_attempts, u.pin_locked_until,
                  u.role_id, r.name, u.default_branch_id, b.code, b.name,
                  u.is_active, u.force_password_change, u.locked_until`,
        [dto.userId],
      );

      if (userRes.rows.length === 0) {
        throw new UnauthorizedException('Invalid cashier PIN.');
      }

      const u = userRes.rows[0];

      // Check PIN lockout
      if (u.pin_locked_until && new Date(u.pin_locked_until).getTime() > Date.now()) {
        const remainingSeconds = Math.ceil((new Date(u.pin_locked_until).getTime() - Date.now()) / 1000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'PIN Locked',
            message: `Wrong PIN. Account locked for 5 minutes after 5 failed attempts.`,
            remainingSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Verify PIN
      let match = false;
      if (u.pin_salt) {
        match = await this.pinHasher.verifyPin(dto.pin, u.pin_salt, u.pin_hash);
      } else {
        match = await this.verifyPassword(u.pin_hash, dto.pin);
      }

      if (!match) {
        const failedAttempts = (u.pin_failed_attempts || 0) + 1;
        if (failedAttempts >= 5) {
          const lockTime = new Date(Date.now() + 5 * 60 * 1000);
          await this.db.query(
            `UPDATE users SET pin_failed_attempts = $1, pin_locked_until = $2 WHERE id = $3`,
            [failedAttempts, lockTime, u.id],
          );
          await this.auditSecurity.logAuthEvent({
            tenantId: u.tenant_id,
            branchId: u.default_branch_id,
            userId: u.id,
            action: 'PIN_LOCKOUT',
            entityName: 'terminals',
            ipAddress,
            result: 'LOCKOUT',
            details: { terminalCode: dto.terminalCode, failedAttempts },
          });
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'PIN Locked',
              message: `Wrong PIN. Account locked for 5 minutes after 5 failed attempts.`,
              remainingSeconds: 5 * 60,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        } else {
          await this.db.query(
            `UPDATE users SET pin_failed_attempts = $1 WHERE id = $2`,
            [failedAttempts, u.id],
          );
          const remaining = 5 - failedAttempts;
          await this.auditSecurity.logAuthEvent({
            tenantId: u.tenant_id,
            branchId: u.default_branch_id,
            userId: u.id,
            action: 'PIN_LOGIN_FAILED',
            entityName: 'terminals',
            ipAddress,
            result: 'FAILURE',
            details: { terminalCode: dto.terminalCode, failedAttempts, remainingAttempts: remaining },
          });
          throw new UnauthorizedException(`Wrong PIN. ${remaining} try${remaining === 1 ? '' : 'ies'} left.`);
        }
      }

      // PIN valid: reset attempts
      await this.db.query(
        `UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = $1`,
        [u.id],
      );
      matchedUser = u;
    } else {
      const candidates = await this.db.query(
        `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
                u.username, u.full_name, u.phone, u.pin_hash, u.pin_salt,
                u.role_id, r.name as role_name, u.default_branch_id,
                b.code as branch_code, b.name as branch_name,
                u.is_active, u.force_password_change, u.locked_until,
                COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN branches b ON b.id = u.default_branch_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE u.is_active = true AND u.pin_hash IS NOT NULL
         GROUP BY u.id, u.tenant_id, t.name, t.slug, u.username, u.full_name, u.phone, u.pin_hash, u.pin_salt,
                  u.role_id, r.name, u.default_branch_id, b.code, b.name,
                  u.is_active, u.force_password_change, u.locked_until`,
      );

      for (const user of candidates.rows) {
        let match = false;
        if (user.pin_salt) {
          match = await this.pinHasher.verifyPin(dto.pin, user.pin_salt, user.pin_hash);
        } else {
          match = await this.verifyPassword(user.pin_hash, dto.pin);
        }
        if (match) {
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser) {
        await this.auditSecurity.logAuthEvent({
          action: 'PIN_LOGIN_FAILED',
          entityName: 'terminals',
          ipAddress,
          result: 'FAILURE',
          details: { terminalCode: dto.terminalCode },
        });
        throw new UnauthorizedException('Invalid cashier PIN.');
      }
    }

    this.rateLimiter.assertNotLocked(matchedUser.locked_until);

    // Terminal verification & last_active update
    if (dto.terminalCode && matchedUser.tenant_id) {
      const termRes = await this.db.query(
        `SELECT id, device_token_hash, is_active FROM terminals WHERE code = $1 AND tenant_id = $2`,
        [dto.terminalCode, matchedUser.tenant_id],
      );
      if (termRes.rows.length > 0) {
        const terminal = termRes.rows[0];
        if (terminal.device_token_hash && dto.deviceToken) {
          const deviceHash = crypto.createHash('sha256').update(dto.deviceToken).digest('hex');
          if (deviceHash !== terminal.device_token_hash) {
            await this.auditSecurity.logAuthEvent({
              tenantId: matchedUser.tenant_id,
              userId: matchedUser.id,
              action: 'TERMINAL_DEVICE_TOKEN_MISMATCH',
              entityName: 'terminals',
              ipAddress,
              result: 'FAILURE',
              details: { terminalCode: dto.terminalCode },
            });
            throw new UnauthorizedException('Terminal device pairing mismatch.');
          }
        }
        await this.db.query(
          `UPDATE terminals SET last_active_at = NOW() WHERE id = $1`,
          [terminal.id],
        );
      }
    }

    const authUser: AuthenticatedUser = {
      id: matchedUser.id,
      tenantId: matchedUser.tenant_id,
      tenantSlug: matchedUser.tenant_slug,
      tenantName: matchedUser.tenant_name,
      username: matchedUser.username,
      fullName: matchedUser.full_name,
      phone: matchedUser.phone,
      role: matchedUser.role_name,
      roleId: matchedUser.role_id,
      branchId: matchedUser.default_branch_id || '00000000-0000-0000-0000-000000000001',
      branchCode: matchedUser.branch_code || 'POS-LANE',
      branchName: matchedUser.branch_name || 'Checkout Terminal',
      permissions: matchedUser.permissions || [],
      forcePasswordChange: !!matchedUser.force_password_change,
    };

    const tokens = await this.tokenSvc.createTenantSessionTokens(
      authUser,
      dto.terminalCode ? `POS Terminal (${dto.terminalCode})` : 'POS Terminal',
      ipAddress,
    );

    await this.auditSecurity.logAuthEvent({
      tenantId: authUser.tenantId,
      branchId: authUser.branchId,
      userId: authUser.id,
      action: 'PIN_LOGIN_SUCCESS',
      entityName: 'terminals',
      ipAddress,
      result: 'SUCCESS',
      details: { terminalCode: dto.terminalCode },
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: authUser,
    };
  }

  /**
   * 4c. Register / Pair Terminal by Manager
   */
  async pairTerminal(
    dto: TerminalPairDto,
    managerUserId?: string,
    ipAddress?: string,
  ): Promise<TerminalPairResponse> {
    const branchRes = await this.db.query(
      `SELECT id, tenant_id FROM branches WHERE id = $1`,
      [dto.branchId],
    );
    if (branchRes.rows.length === 0) {
      throw new NotFoundException('Branch not found');
    }
    const tenantId = branchRes.rows[0].tenant_id;

    const rawDeviceToken = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = crypto.createHash('sha256').update(rawDeviceToken).digest('hex');
    const autoLockMinutes = dto.autoLockMinutes && dto.autoLockMinutes > 0 ? dto.autoLockMinutes : 3;

    const upsertRes = await this.db.query(
      `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_token_hash, paired_at, paired_by, auto_lock_minutes, is_active)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), $6, $7, TRUE)
       ON CONFLICT (tenant_id, code) DO UPDATE SET
         branch_id = EXCLUDED.branch_id,
         name = EXCLUDED.name,
         device_token_hash = EXCLUDED.device_token_hash,
         paired_at = EXCLUDED.paired_at,
         paired_by = EXCLUDED.paired_by,
         auto_lock_minutes = EXCLUDED.auto_lock_minutes,
         is_active = TRUE
       RETURNING id, code, name, branch_id, auto_lock_minutes`,
      [tenantId, dto.branchId, dto.terminalCode.trim().toUpperCase(), dto.terminalName.trim(), deviceTokenHash, managerUserId || null, autoLockMinutes],
      tenantId,
    );

    const term = upsertRes.rows[0];

    await this.auditSecurity.logAuthEvent({
      tenantId,
      branchId: dto.branchId,
      userId: managerUserId,
      action: 'TERMINAL_PAIRED',
      entityName: 'terminals',
      ipAddress,
      result: 'SUCCESS',
      details: { terminalId: term.id, terminalCode: term.code, terminalName: term.name },
    });

    return {
      terminalId: term.id,
      terminalCode: term.code,
      terminalName: term.name,
      branchId: term.branch_id,
      deviceToken: rawDeviceToken,
      autoLockMinutes: term.auto_lock_minutes,
    };
  }

  /**
   * 4d. Manager PIN Override for Privileged POS Actions
   */
  async managerOverride(
    dto: ManagerOverrideDto,
    ipAddress?: string,
  ): Promise<ManagerOverrideResult> {
    let query = `
      SELECT u.id, u.username, u.full_name, u.tenant_id, u.pin_hash, u.pin_salt,
             r.name as role_name,
             COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN user_branch_assignments uba ON uba.user_id = u.id
      WHERE u.is_active = TRUE AND u.pin_hash IS NOT NULL
        AND r.name IN ('OWNER', 'BRANCH_MANAGER', 'SUPER_ADMIN')
    `;
    const params: any[] = [];
    if (dto.branchId) {
      params.push(dto.branchId);
      query += ` AND (u.default_branch_id = $${params.length} OR uba.branch_id = $${params.length})`;
    }
    query += ` GROUP BY u.id, u.username, u.full_name, u.tenant_id, u.pin_hash, u.pin_salt, r.name`;

    const candidates = await this.db.query(query, params);

    let authorizedSupervisor: any = null;
    for (const supervisor of candidates.rows) {
      let isMatch = false;
      if (supervisor.pin_salt) {
        isMatch = await this.pinHasher.verifyPin(dto.managerPin, supervisor.pin_salt, supervisor.pin_hash);
      } else {
        isMatch = await this.verifyPassword(supervisor.pin_hash, dto.managerPin);
      }

      if (isMatch) {
        authorizedSupervisor = supervisor;
        break;
      }
    }

    if (!authorizedSupervisor) {
      await this.auditSecurity.logAuthEvent({
        action: 'MANAGER_OVERRIDE_FAILED',
        entityName: 'pos_sales',
        ipAddress,
        result: 'FAILURE',
        details: { action: dto.action, branchId: dto.branchId, cashierId: dto.cashierId },
      });
      throw new UnauthorizedException('Invalid manager authorization PIN');
    }

    if (
      dto.requiredPermission &&
      authorizedSupervisor.role_name !== 'OWNER' &&
      authorizedSupervisor.role_name !== 'SUPER_ADMIN'
    ) {
      const hasPerm = authorizedSupervisor.permissions.includes(dto.requiredPermission);
      if (!hasPerm) {
        throw new ForbiddenException(`Manager does not have required permission: ${dto.requiredPermission}`);
      }
    }

    await this.auditSecurity.logAuthEvent({
      tenantId: authorizedSupervisor.tenant_id,
      branchId: dto.branchId,
      userId: authorizedSupervisor.id,
      action: 'MANAGER_OVERRIDE',
      entityName: 'pos_sales',
      ipAddress,
      result: 'SUCCESS',
      details: {
        action: dto.action,
        supervisorId: authorizedSupervisor.id,
        supervisorName: authorizedSupervisor.full_name || authorizedSupervisor.username,
        cashierId: dto.cashierId,
        amount: dto.amount,
        notes: dto.notes,
      },
    });

    return {
      authorized: true,
      supervisorId: authorizedSupervisor.id,
      supervisorName: authorizedSupervisor.full_name || authorizedSupervisor.username,
      supervisorRole: authorizedSupervisor.role_name,
    };
  }

  /**
   * 5. Refresh Token Rotation
   */
  async refreshSession(
    rawCombinedToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
    return this.tokenSvc.rotateTenantRefreshToken(rawCombinedToken, ipAddress, userAgent);
  }

  /**
   * 6. Logout (Revoke Single Session)
   */
  async logout(userId: string, rawToken?: string): Promise<void> {
    if (rawToken) {
      await this.tokenSvc.revokeTenantToken(rawToken);
    }
    await this.auditSecurity.logAuthEvent({
      userId,
      action: 'USER_LOGOUT',
      result: 'SUCCESS',
    });
  }

  /**
   * 7. Logout All Sessions
   */
  async logoutAll(userId: string): Promise<void> {
    await this.tokenSvc.revokeAllTenantSessions(userId);
    await this.auditSecurity.logAuthEvent({
      userId,
      action: 'USER_LOGOUT_ALL',
      result: 'SUCCESS',
    });
  }

  /**
   * 8. Change Password (Enforces min 10 chars, strength rules, revokes old sessions)
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ message: string; accessToken: string }> {
    this.passwordPolicy.assertValidPassword(dto.newPassword);

    const userRes = await this.db.query(
      `SELECT id, tenant_id, password_hash, username, full_name, role_id, default_branch_id FROM users WHERE id = $1`,
      [userId],
    );

    if (userRes.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    const user = userRes.rows[0];
    const isCurrentValid = await this.verifyPassword(user.password_hash, dto.currentPassword);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password does not match');
    }

    const newHash = await this.hashPassword(dto.newPassword);

    await this.db.withTransaction(async (client) => {
      await client.query(
        `UPDATE users
         SET password_hash = $1, force_password_change = false, token_version = token_version + 1, updated_at = clock_timestamp()
         WHERE id = $2`,
        [newHash, userId],
        user.tenant_id,
      );
      // Invalidate existing refresh tokens
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
        user.tenant_id,
      );
    });

    await this.auditSecurity.logAuthEvent({
      tenantId: user.tenant_id,
      userId,
      action: 'PASSWORD_CHANGED',
      ipAddress,
      userAgent,
      result: 'SUCCESS',
    });

    // Re-issue a fresh token for this user so current session continues uninterrupted
    const roleRes = await this.db.query(`SELECT name FROM roles WHERE id = $1`, [user.role_id]);
    const authUser: AuthenticatedUser = {
      id: user.id,
      tenantId: user.tenant_id,
      username: user.username,
      fullName: user.full_name,
      role: roleRes.rows[0]?.name || 'OWNER',
      roleId: user.role_id,
      branchId: user.default_branch_id || '00000000-0000-0000-0000-000000000001',
      permissions: [],
      forcePasswordChange: false,
    };

    const tokens = await this.tokenSvc.createTenantSessionTokens(authUser, 'Password Change', ipAddress, userAgent);
    return {
      message: 'Password changed successfully',
      accessToken: tokens.accessToken,
    };
  }

  /**
   * 9. Self-service Change PIN
   */
  async changePin(userId: string, dto: ChangePinDto): Promise<void> {
    this.pinHasher.assertValidPin(dto.newPin);
    const pinSalt = this.pinHasher.generateSalt();
    const pinHash = await this.pinHasher.hashPin(dto.newPin, pinSalt);

    await this.db.query(
      `UPDATE users SET pin_hash = $1, pin_salt = $2, updated_at = clock_timestamp() WHERE id = $3`,
      [pinHash, pinSalt, userId],
    );

    await this.auditSecurity.logAuthEvent({
      userId,
      action: 'PIN_CHANGED',
      result: 'SUCCESS',
      details: { selfService: true },
    });
  }

  /**
   * 10. Forgot Password: Request 10-minute Single-Use Reset Code
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string; channel: string; maskedTarget: string }> {
    this.rateLimiter.checkIpRateLimit(ipAddress);

    const tenantRes = await this.db.query(
      `SELECT id FROM tenants WHERE LOWER(slug) = LOWER($1) OR id::text = $1 LIMIT 1`,
      [dto.companyCode.trim()],
    );

    if (tenantRes.rows.length === 0) {
      return {
        success: true,
        message: 'If the account exists, a 10-minute reset code has been sent.',
        channel: dto.channel || 'SMS',
        maskedTarget: '****',
      };
    }

    const tenantId = tenantRes.rows[0].id;
    const identifier = dto.usernameOrPhone.trim();

    const userRes = await this.db.query(
      `SELECT id, email, phone FROM users WHERE (LOWER(username) = LOWER($1) OR phone = $1) AND tenant_id = $2`,
      [identifier, tenantId],
      tenantId,
    );

    if (userRes.rows.length === 0) {
      return {
        success: true,
        message: 'If the account exists, a 10-minute reset code has been sent.',
        channel: dto.channel || 'SMS',
        maskedTarget: '****',
      };
    }

    const user = userRes.rows[0];
    const contactTarget = dto.channel === 'EMAIL' ? user.email : user.phone;
    if (!contactTarget) {
      return {
        success: true,
        message: 'If the account exists, a 10-minute reset code has been sent.',
        channel: dto.channel || 'SMS',
        maskedTarget: '****',
      };
    }

    // Generate 6-digit random code
    const rawCode = (100000 + crypto.randomInt(900000)).toString();
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate existing unused reset codes for this user
    await this.db.query(
      `DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
      tenantId,
    );

    await this.db.query(
      `INSERT INTO password_resets (id, tenant_id, user_id, code_hash, contact_type, contact_target, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [generateUuidV7(), tenantId, user.id, codeHash, dto.channel, contactTarget, expiresAt],
      tenantId,
    );

    // Abstracted notification logging
    this.logger.log(
      `[MOCK NOTIFICATION DISPATCH] Password reset code for user ${user.id} (${dto.channel}: ${contactTarget}): ${rawCode}`,
    );

    await this.auditSecurity.logAuthEvent({
      tenantId,
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      ipAddress,
      userAgent,
      result: 'SUCCESS',
      details: { channel: dto.channel },
    });

    const maskedTarget =
      dto.channel === 'EMAIL'
        ? contactTarget.replace(/^(.{2})(.*)(@.*)$/, '$1***$3')
        : contactTarget.slice(0, 4) + '****' + contactTarget.slice(-2);

    return {
      success: true,
      message: 'If the account exists, a 10-minute reset code has been sent.',
      channel: dto.channel,
      maskedTarget,
    };
  }

  /**
   * 11. Reset Password with Code
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.passwordPolicy.assertValidPassword(dto.newPassword);

    const tenantRes = await this.db.query(
      `SELECT id FROM tenants WHERE LOWER(slug) = LOWER($1) OR id::text = $1 LIMIT 1`,
      [dto.companyCode.trim()],
    );

    if (tenantRes.rows.length === 0) {
      throw new BadRequestException('Invalid or expired reset code');
    }
    const tenantId = tenantRes.rows[0].id;

    const userRes = await this.db.query(
      `SELECT id FROM users WHERE (LOWER(username) = LOWER($1) OR phone = $1) AND tenant_id = $2`,
      [dto.usernameOrPhone.trim(), tenantId],
      tenantId,
    );

    if (userRes.rows.length === 0) {
      throw new BadRequestException('Invalid or expired reset code');
    }
    const user = userRes.rows[0];

    const codeHash = crypto.createHash('sha256').update(dto.code.trim()).digest('hex');

    const resetRes = await this.db.query(
      `SELECT id, expires_at FROM password_resets
       WHERE user_id = $1 AND tenant_id = $2 AND code_hash = $3 AND used_at IS NULL AND expires_at > clock_timestamp()
       LIMIT 1`,
      [user.id, tenantId, codeHash],
      tenantId,
    );

    if (resetRes.rows.length === 0) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    const resetRecord = resetRes.rows[0];
    const newHash = await this.hashPassword(dto.newPassword);

    await this.db.withTransaction(async (client) => {
      // Mark code used
      await client.query(
        `UPDATE password_resets SET used_at = clock_timestamp() WHERE id = $1`,
        [resetRecord.id],
        tenantId,
      );
      // Update user password and increment token_version
      await client.query(
        `UPDATE users
         SET password_hash = $1, force_password_change = false, token_version = token_version + 1, failed_login_attempts = 0, locked_until = NULL, updated_at = clock_timestamp()
         WHERE id = $2`,
        [newHash, user.id],
        tenantId,
      );
      // Revoke all existing sessions
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [user.id],
        tenantId,
      );
    });

    await this.auditSecurity.logAuthEvent({
      tenantId,
      userId: user.id,
      action: 'PASSWORD_RESET_COMPLETED',
      ipAddress,
      userAgent,
      result: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Password has been reset successfully. Please sign in with your new password.',
    };
  }

  /**
   * 12. User Profile & Session Management
   */
  async getUserProfile(userId: string, tenantId?: string) {
    const res = await this.db.query(
      `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
              u.username, u.full_name, u.email, u.phone, u.role_id, r.name as role_name,
              u.default_branch_id, b.code as branch_code, b.name as branch_name,
              u.requires_totp, u.created_at
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.default_branch_id
       WHERE u.id = $1`,
      [userId],
      tenantId,
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('User profile not found');
    }

    const user = res.rows[0];

    const branchRes = await this.db.query(
      `SELECT b.id, b.code, b.name
       FROM branches b
       JOIN user_branch_assignments uba ON uba.branch_id = b.id
       WHERE uba.user_id = $1 AND b.tenant_id = $2`,
      [userId, user.tenant_id],
      user.tenant_id,
    );

    return {
      id: user.id,
      tenantId: user.tenant_id,
      tenantName: user.tenant_name,
      tenantSlug: user.tenant_slug,
      username: user.username,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role_name,
      defaultBranchId: user.default_branch_id,
      defaultBranchName: user.branch_name,
      requiresTotp: !!user.requires_totp,
      assignedBranches: branchRes.rows,
      createdAt: user.created_at,
    };
  }

  async updateUserProfile(userId: string, dto: UpdateProfileDto, tenantId?: string) {
    const updates: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (dto.fullName) {
      updates.push(`full_name = $${idx++}`);
      params.push(dto.fullName.trim());
    }
    if (dto.email !== undefined) {
      updates.push(`email = $${idx++}`);
      params.push(dto.email ? dto.email.trim() : null);
    }
    if (dto.phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      params.push(dto.phone ? dto.phone.trim() : null);
    }
    if (dto.defaultBranchId) {
      updates.push(`default_branch_id = $${idx++}`);
      params.push(dto.defaultBranchId);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = clock_timestamp()`);
      params.push(userId);
      await this.db.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`,
        params,
        tenantId,
      );
    }

    return this.getUserProfile(userId, tenantId);
  }

  async getUserSessions(userId: string, tenantId?: string): Promise<UserSessionInfo[]> {
    const res = await this.db.query(
      `SELECT id, device_info, ip_address, user_agent, created_at, expires_at, revoked_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()
       ORDER BY created_at DESC`,
      [userId],
      tenantId,
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      device: r.device_info || 'Browser Session',
      ip: r.ip_address || 'Unknown',
      userAgent: r.user_agent || undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
      expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : '',
    }));
  }

  async revokeSession(userId: string, sessionId: string, tenantId?: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
      tenantId,
    );
  }
}
