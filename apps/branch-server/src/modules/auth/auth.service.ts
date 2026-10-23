import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import {
  SetupWizardDto,
  LoginDto,
  PinLoginDto,
  ChangePasswordDto,
  ChangePinDto,
} from './dto/auth.dto';
import {
  LoginResponse,
  AuthenticatedUser,
  SetupStatusResponse,
  generateUuidV7,
} from '@gebeyaos/shared-types';
import { JWT_SECRET } from '../../common/guards/jwt-auth.guard';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Helper: Hash password using Argon2id
   */
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
    });
  }

  /**
   * Helper: Verify password with Argon2id, with bcrypt fallback for seeded records
   */
  async verifyPassword(storedHash: string, candidate: string): Promise<boolean> {
    if (!storedHash) return false;
    try {
      if (storedHash.startsWith('$argon2')) {
        return await argon2.verify(storedHash, candidate);
      }
      return await bcrypt.compare(candidate, storedHash);
    } catch {
      return false;
    }
  }

  /**
   * Helper: Generate JWT tokens and register refresh token
   */
  private async createSessionTokens(
    user: AuthenticatedUser,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId,
      permissions: user.permissions,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);

    await this.db.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [generateUuidV7(), user.id, tokenHash, expiresAt],
    );

    return {
      accessToken,
      refreshToken: `${user.id}.${rawRefreshToken}`,
      expiresIn: 900, // 15 mins in seconds
    };
  }

  /**
   * 1. First-Run Setup Status
   */
  async getSetupStatus(): Promise<SetupStatusResponse> {
    // Check if system_settings has setup_completed
    const settingsRes = await this.db.query(
      `SELECT value FROM system_settings WHERE key = 'setup_completed'`,
    );

    const userCountRes = await this.db.query(
      `SELECT count(*)::int as count FROM users WHERE is_active = true`,
    );

    const userCount = userCountRes.rows[0]?.count || 0;
    const isCompleted = settingsRes.rows.length > 0 && settingsRes.rows[0].value?.completed;

    if (isCompleted || userCount > 0) {
      const branchRes = await this.db.query(
        `SELECT code, name FROM branches ORDER BY is_hq DESC, created_at ASC LIMIT 1`,
      );
      return {
        setupCompleted: true,
        storeName: branchRes.rows[0]?.name || 'Gebeya Supermarket',
        ownerExists: userCount > 0,
        defaultBranchCode: branchRes.rows[0]?.code || 'BOLE-01',
      };
    }

    return {
      setupCompleted: false,
      ownerExists: false,
    };
  }

  /**
   * 1b. First-Run Setup Wizard Execution (Permanently Locks)
   */
  async executeSetup(dto: SetupWizardDto, ipAddress?: string): Promise<LoginResponse> {
    const status = await this.getSetupStatus();
    if (status.setupCompleted) {
      throw new ForbiddenException(
        'First-run setup wizard has already been completed and is permanently locked.',
      );
    }

    return this.db.withTransaction(async (client) => {
      // 1. Create or update the primary store branch
      const branchId = generateUuidV7();
      await client.query(
        `INSERT INTO branches (id, code, name, trade_name, tin_number, phone, is_hq, settings)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
         ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            trade_name = EXCLUDED.trade_name,
            tin_number = EXCLUDED.tin_number,
            settings = EXCLUDED.settings`,
        [
          branchId,
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

      // 2. Fetch the OWNER role ID
      const roleRes = await client.query(
        `SELECT id FROM roles WHERE name = 'OWNER' LIMIT 1`,
      );
      if (roleRes.rows.length === 0) {
        throw new NotFoundException('OWNER role is missing in system roles.');
      }
      const ownerRoleId = roleRes.rows[0].id;

      // 3. Hash Owner credentials
      const passwordHash = await this.hashPassword(dto.ownerPassword);
      const pinHash = await this.hashPassword(dto.ownerPin);
      const ownerId = generateUuidV7();

      // 4. Create Owner user
      await client.query(
        `INSERT INTO users (id, username, full_name, phone, password_hash, pin_hash, role_id, default_branch_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)`,
        [
          ownerId,
          dto.ownerUsername.toLowerCase().trim(),
          dto.ownerFullName.trim(),
          dto.ownerPhone.trim(),
          passwordHash,
          pinHash,
          ownerRoleId,
          branchId,
        ],
      );

      // Assign owner to the branch
      await client.query(
        `INSERT INTO user_branch_assignments (user_id, branch_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [ownerId, branchId],
      );

      // 5. Lock Setup Wizard permanently
      await client.query(
        `INSERT INTO system_settings (key, value)
         VALUES ('setup_completed', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = clock_timestamp()`,
        [
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

      // 6. Log audit entry
      await client.query(
        `INSERT INTO audit_logs (id, branch_id, user_id, action, entity_name, entity_id, ip_address, details)
         VALUES ($1, $2, $3, 'SETUP_WIZARD_COMPLETED', 'system_settings', $1, $4, $5)`,
        [
          generateUuidV7(),
          branchId,
          ownerId,
          ipAddress || '127.0.0.1',
          JSON.stringify({ company: dto.companyName, owner: dto.ownerUsername }),
        ],
      );

      // 7. Retrieve full permissions for OWNER
      const permsRes = await client.query(
        `SELECT permission_id FROM role_permissions WHERE role_id = $1`,
        [ownerRoleId],
      );
      const permissions = permsRes.rows.map((r: any) => r.permission_id);

      const authUser: AuthenticatedUser = {
        id: ownerId,
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

      const tokens = await this.createSessionTokens(authUser);
      return {
        ...tokens,
        user: authUser,
      };
    });
  }

  /**
   * 2. Back-Office Login (Argon2 + Rate Limiting / Lockout)
   */
  async login(dto: LoginDto, ipAddress?: string): Promise<LoginResponse> {
    const identifier = dto.usernameOrPhone.trim();

    // Query user by username or phone
    const res = await this.db.query(
      `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.password_hash,
              u.pin_hash, u.role_id, r.name as role_name, u.default_branch_id,
              b.code as branch_code, b.name as branch_name,
              u.is_active, u.failed_login_attempts, u.locked_until,
              u.force_password_change,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.default_branch_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE LOWER(u.username) = LOWER($1) OR u.phone = $1
       GROUP BY u.id, u.username, u.full_name, u.email, u.phone, u.password_hash,
                u.pin_hash, u.role_id, r.name, u.default_branch_id, b.code, b.name,
                u.is_active, u.failed_login_attempts, u.locked_until, u.force_password_change`,
      [identifier],
    );

    if (res.rows.length === 0) {
      await this.logAudit(null, null, 'LOGIN_FAILED', 'users', null, ipAddress, {
        reason: 'User not found',
        identifier,
      });
      throw new UnauthorizedException('Invalid username/phone or password');
    }

    const row = res.rows[0];

    // Check account lockout
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      const remainingSeconds = Math.ceil(
        (new Date(row.locked_until).getTime() - Date.now()) / 1000,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'Too Many Requests',
          message: `Account is temporarily locked due to repeated failed logins. Please try again in ${Math.ceil(
            remainingSeconds / 60,
          )} minute(s) (${remainingSeconds}s).`,
          remainingSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Verify Password
    const isValid = await this.verifyPassword(row.password_hash, dto.password);

    if (!isValid) {
      const newAttempts = (row.failed_login_attempts || 0) + 1;
      let lockoutDate: Date | null = null;

      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        lockoutDate = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        await this.db.query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [newAttempts, lockoutDate, row.id],
        );
        await this.logAudit(row.default_branch_id, row.id, 'USER_LOCKOUT', 'users', row.id, ipAddress, {
          failedAttempts: newAttempts,
          lockedUntil: lockoutDate,
        });
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            error: 'Account Locked',
            message: `Too many failed login attempts. Your account is locked for ${LOCKOUT_MINUTES} minutes.`,
            remainingSeconds: LOCKOUT_MINUTES * 60,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      } else {
        await this.db.query(
          `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`,
          [newAttempts, row.id],
        );
        const remaining = MAX_FAILED_ATTEMPTS - newAttempts;
        await this.logAudit(row.default_branch_id, row.id, 'LOGIN_FAILED', 'users', row.id, ipAddress, {
          failedAttempts: newAttempts,
        });
        throw new UnauthorizedException(
          `Invalid credentials. ${remaining} attempt(s) remaining before account lockout.`,
        );
      }
    }

    // Verify user is active
    if (!row.is_active) {
      throw new UnauthorizedException('User account is inactive. Please contact your manager.');
    }

    // Successful login: reset lockout counters
    await this.db.query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = clock_timestamp() WHERE id = $1`,
      [row.id],
    );

    const authUser: AuthenticatedUser = {
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      role: row.role_name,
      roleId: row.role_id,
      branchId: row.default_branch_id || '00000000-0000-0000-0000-000000000001',
      branchCode: row.branch_code || 'BOLE-01',
      branchName: row.branch_name || 'Main Branch',
      permissions: row.permissions || [],
      forcePasswordChange: !!row.force_password_change,
    };

    await this.logAudit(authUser.branchId, authUser.id, 'LOGIN_SUCCESS', 'users', authUser.id, ipAddress, {
      method: 'PASSWORD',
    });

    const tokens = await this.createSessionTokens(authUser);
    return {
      ...tokens,
      user: authUser,
    };
  }

  /**
   * 3. Fast Cashier PIN Login (POS Terminal Quick Switch)
   */
  async pinLogin(dto: PinLoginDto, ipAddress?: string): Promise<LoginResponse> {
    const candidates = await this.db.query(
      `SELECT u.id, u.username, u.full_name, u.phone, u.pin_hash,
              u.role_id, r.name as role_name, u.default_branch_id,
              b.code as branch_code, b.name as branch_name,
              u.is_active, u.force_password_change,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN branches b ON b.id = u.default_branch_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE u.is_active = true AND u.pin_hash IS NOT NULL
       GROUP BY u.id, u.username, u.full_name, u.phone, u.pin_hash,
                u.role_id, r.name, u.default_branch_id, b.code, b.name,
                u.is_active, u.force_password_change`,
    );

    let matchedUser: any = null;
    for (const user of candidates.rows) {
      const match = await this.verifyPassword(user.pin_hash, dto.pin);
      if (match) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      await this.logAudit(null, null, 'PIN_LOGIN_FAILED', 'terminals', null, ipAddress, {
        terminalCode: dto.terminalCode,
      });
      throw new UnauthorizedException('Invalid cashier PIN.');
    }

    const authUser: AuthenticatedUser = {
      id: matchedUser.id,
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

    await this.logAudit(authUser.branchId, authUser.id, 'PIN_LOGIN_SUCCESS', 'terminals', authUser.id, ipAddress, {
      terminalCode: dto.terminalCode,
    });

    const tokens = await this.createSessionTokens(authUser);
    return {
      ...tokens,
      user: authUser,
    };
  }

  /**
   * 4. Refresh Token Rotation
   */
  async refreshSession(rawCombinedToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    const [userId, rawToken] = rawCombinedToken.split('.');
    if (!userId || !rawToken) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const res = await this.db.query(
      `SELECT rt.id, u.id as user_id, u.username, u.is_active, r.name as role_name,
              u.default_branch_id,
              COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE rt.user_id = $1 AND rt.token_hash = $2 AND rt.revoked_at IS NULL AND rt.expires_at > clock_timestamp()
       GROUP BY rt.id, u.id, u.username, u.is_active, r.name, u.default_branch_id`,
      [userId, tokenHash],
    );

    if (res.rows.length === 0 || !res.rows[0].is_active) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const row = res.rows[0];
    const payload = {
      sub: row.user_id,
      username: row.username,
      role: row.role_name,
      branchId: row.default_branch_id,
      permissions: row.permissions,
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    return { accessToken, expiresIn: 900 };
  }

  /**
   * 5. Logout & Revocation
   */
  async logout(userId: string, rawCombinedToken?: string): Promise<void> {
    if (rawCombinedToken && rawCombinedToken.includes('.')) {
      const [, rawToken] = rawCombinedToken.split('.');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND token_hash = $2`,
        [userId, tokenHash],
      );
    } else {
      // Revoke all active sessions
      await this.db.query(
        `UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    }

    await this.logAudit(null, userId, 'LOGOUT', 'users', userId, undefined, {});
  }

  /**
   * 6. Self-service Change Password
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const res = await this.db.query(
      `SELECT id, password_hash FROM users WHERE id = $1`,
      [userId],
    );
    if (res.rows.length === 0) throw new NotFoundException('User not found');

    const valid = await this.verifyPassword(res.rows[0].password_hash, dto.currentPassword);
    if (!valid) throw new UnauthorizedException('Current password does not match.');

    const newHash = await this.hashPassword(dto.newPassword);
    await this.db.query(
      `UPDATE users SET password_hash = $1, force_password_change = FALSE, updated_at = clock_timestamp() WHERE id = $2`,
      [newHash, userId],
    );

    await this.logAudit(null, userId, 'PASSWORD_CHANGED', 'users', userId, undefined, { selfService: true });
  }

  /**
   * 7. Self-service Change PIN
   */
  async changePin(userId: string, dto: ChangePinDto): Promise<void> {
    const newPinHash = await this.hashPassword(dto.newPin);
    await this.db.query(
      `UPDATE users SET pin_hash = $1, updated_at = clock_timestamp() WHERE id = $2`,
      [newPinHash, userId],
    );

    await this.logAudit(null, userId, 'PIN_CHANGED', 'users', userId, undefined, { selfService: true });
  }

  private async logAudit(
    branchId: string | null,
    userId: string | null,
    action: string,
    entityName: string,
    entityId: string | null,
    ipAddress?: string,
    details?: any,
  ) {
    try {
      await this.db.query(
        `INSERT INTO audit_logs (id, branch_id, user_id, action, entity_name, entity_id, ip_address, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          generateUuidV7(),
          branchId,
          userId,
          action,
          entityName,
          entityId,
          ipAddress || '127.0.0.1',
          details ? JSON.stringify(details) : null,
        ],
      );
    } catch (e: any) {
      this.logger.error('Failed to write audit log', e.stack);
    }
  }
}
