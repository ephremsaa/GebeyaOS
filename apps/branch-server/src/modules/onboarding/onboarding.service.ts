import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { DatabaseService } from '../../common/database/database.service';
import { JWT_SECRET } from '../../common/guards/jwt-auth.guard';
import { generateUuidV7, AuthenticatedUser } from '@gebeyaos/shared-types';
import {
  CompleteTenantOnboardingDto,
  UpdateTenantBrandingDto,
} from './dto/onboarding.dto';

const ACCESS_TOKEN_EXPIRY = 86400; // 24 hours
const REFRESH_TOKEN_DAYS = 30;

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * 1. Verify Tenant Invite Link
   */
  async verifyInvite(token: string) {
    const res = await this.db.query(
      `SELECT til.id, til.tenant_id, til.token, til.invitee_email, til.invitee_phone,
              til.role_name, til.used_at, til.expires_at, til.wizard_state,
              t.name as tenant_name, t.slug as tenant_slug, t.plan as tenant_plan,
              t.status as tenant_status
       FROM tenant_invite_links til
       JOIN tenants t ON t.id = til.tenant_id
       WHERE til.token = $1`,
      [token.trim()],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Invitation link is invalid or does not exist');
    }

    const invite = res.rows[0];
    const isExpired = new Date(invite.expires_at) < new Date();
    const isUsed = invite.used_at !== null;

    if (isUsed) {
      throw new BadRequestException('This onboarding invitation has already been used to configure the supermarket');
    }

    if (isExpired) {
      throw new BadRequestException('This onboarding invitation link has expired. Please contact the platform operator.');
    }

    return {
      valid: true,
      tenantId: invite.tenant_id,
      tenantName: invite.tenant_name,
      tenantSlug: invite.tenant_slug,
      tenantPlan: invite.tenant_plan,
      inviteeEmail: invite.invitee_email,
      inviteePhone: invite.invitee_phone,
      wizardState: invite.wizard_state || {},
    };
  }

  /**
   * 2. Complete First-Run Multi-Tenant Onboarding Wizard
   */
  async completeOnboarding(dto: CompleteTenantOnboardingDto, ipAddress?: string) {
    const invite = await this.verifyInvite(dto.token);
    const tenantId = invite.tenantId;

    return await this.db.withTransaction(async (client) => {
      // Set session context for tenant
      await client.query(`SELECT set_tenant_context($1)`, [tenantId]);

      // 1. Update Tenant details & branding
      await client.query(
        `UPDATE tenants
         SET name = $1,
             tin_number = $2,
             vat_settings = $3,
             default_language = $4,
             receipt_header = $5,
             receipt_footer = $6,
             logo_url = $7,
             owner_phone = $8,
             status = 'active',
             updated_at = clock_timestamp()
         WHERE id = $9`,
        [
          dto.companyName.trim(),
          dto.tinNumber.trim(),
          JSON.stringify(dto.vatSettings),
          dto.defaultLanguage,
          dto.receiptHeader.trim(),
          dto.receiptFooter.trim(),
          dto.logoUrl ? dto.logoUrl.trim() : null,
          dto.ownerPhone.trim(),
          tenantId,
        ],
      );

      // 2. Ensure standard system roles exist for this tenant
      let ownerRoleRes = await client.query(
        `SELECT id FROM roles WHERE tenant_id = $1 AND name = 'OWNER'`,
        [tenantId],
      );

      let ownerRoleId: string;
      if (ownerRoleRes.rows.length === 0) {
        ownerRoleId = generateUuidV7();
        await client.query(
          `INSERT INTO roles (id, tenant_id, name, description, is_system, max_discount_percentage)
           VALUES ($1, $2, 'OWNER', 'Supermarket Company Owner with unrestricted administrative rights', TRUE, 100.00)`,
          [ownerRoleId, tenantId],
        );

        // Assign all permissions to Owner role
        const allPerms = await client.query(`SELECT id FROM permissions`);
        for (const p of allPerms.rows) {
          await client.query(
            `INSERT INTO role_permissions (role_id, permission_id, tenant_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [ownerRoleId, p.id, tenantId],
          );
        }
      } else {
        ownerRoleId = ownerRoleRes.rows[0].id;
      }

      // 3. Create First Branch
      const branchId = generateUuidV7();
      const branchCode = dto.branchCode.trim().toUpperCase();
      await client.query(
        `INSERT INTO branches (
          id, tenant_id, code, name, trade_name, tin_number, phone, city, is_hq, settings
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)`,
        [
          branchId,
          tenantId,
          branchCode,
          dto.branchName.trim(),
          dto.tradeName ? dto.tradeName.trim() : dto.companyName.trim(),
          dto.tinNumber.trim(),
          dto.branchPhone.trim(),
          dto.branchCity ? dto.branchCity.trim() : 'Addis Ababa',
          JSON.stringify({
            currency: 'ETB',
            default_vat_rate: dto.vatSettings.rate,
            vat_inclusive: dto.vatSettings.inclusive,
            allow_negative_stock: false,
          }),
        ],
      );

      // 4. Create First POS Terminal
      const terminalId = generateUuidV7();
      await client.query(
        `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type, is_active)
         VALUES ($1, $2, $3, 'POS-01', 'Lane 1 Express', 'POS_STATION', TRUE)`,
        [terminalId, tenantId, branchId],
      );

      // 5. Hash Owner Credentials (Argon2id)
      const passwordHash = await argon2.hash(dto.ownerPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });

      const pinHash = await argon2.hash(dto.ownerPin, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
      });

      const ownerUserId = generateUuidV7();
      await client.query(
        `INSERT INTO users (
          id, tenant_id, username, full_name, phone, password_hash, pin_hash,
          role_id, default_branch_id, is_active, force_password_change
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, FALSE)`,
        [
          ownerUserId,
          tenantId,
          dto.ownerUsername.trim().toLowerCase(),
          dto.ownerFullName.trim(),
          dto.ownerPhone.trim(),
          passwordHash,
          pinHash,
          ownerRoleId,
          branchId,
        ],
      );

      // 6. Mark invite token as used
      await client.query(
        `UPDATE tenant_invite_links
         SET used_at = clock_timestamp(),
             wizard_state = jsonb_set(COALESCE(wizard_state, '{}'::jsonb), '{completed}', 'true'::jsonb)
         WHERE token = $1`,
        [dto.token],
      );

      // 7. Generate JWT Session for immediate login
      const payload = {
        sub: ownerUserId,
        tenantId,
        tenantSlug: invite.tenantSlug,
        tenantName: dto.companyName.trim(),
        username: dto.ownerUsername.trim().toLowerCase(),
        fullName: dto.ownerFullName.trim(),
        role: 'OWNER',
        roleId: ownerRoleId,
        branchId,
        branchCode,
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
      const rawRefreshToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
      const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 3600 * 1000);

      await client.query(
        `INSERT INTO refresh_tokens (id, tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [generateUuidV7(), tenantId, ownerUserId, tokenHash, refreshExpiresAt],
      );

      // Fetch all permission strings
      const permRes = await client.query(`SELECT id FROM permissions`);
      const permissions = permRes.rows.map((r) => r.id);

      const user: AuthenticatedUser = {
        id: ownerUserId,
        tenantId,
        tenantSlug: invite.tenantSlug,
        tenantName: dto.companyName.trim(),
        username: dto.ownerUsername.trim().toLowerCase(),
        fullName: dto.ownerFullName.trim(),
        phone: dto.ownerPhone.trim(),
        role: 'OWNER',
        roleId: ownerRoleId,
        branchId,
        branchCode,
        branchName: dto.branchName.trim(),
        permissions,
        forcePasswordChange: false,
      };

      return {
        accessToken,
        refreshToken: `${ownerUserId}.${rawRefreshToken}`,
        expiresIn: ACCESS_TOKEN_EXPIRY,
        user,
        tenant: {
          id: tenantId,
          name: dto.companyName.trim(),
          slug: invite.tenantSlug,
          plan: invite.tenantPlan,
          logoUrl: dto.logoUrl,
          receiptHeader: dto.receiptHeader,
          receiptFooter: dto.receiptFooter,
          defaultLanguage: dto.defaultLanguage,
        },
        checklist: {
          importProducts: false,
          addStaff: false,
          addBranches: false,
        },
      };
    });
  }

  /**
   * 3. Get Branding
   */
  async getBranding(tenantId: string) {
    const res = await this.db.query(
      `SELECT id, name, slug, logo_url, receipt_header, receipt_footer,
              default_language, vat_settings, tin_number
       FROM tenants
       WHERE id = $1`,
      [tenantId],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }

    const t = res.rows[0];
    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      logoUrl: t.logo_url,
      receiptHeader: t.receipt_header,
      receiptFooter: t.receipt_footer,
      defaultLanguage: t.default_language,
      vatSettings: t.vat_settings,
      tinNumber: t.tin_number,
    };
  }

  /**
   * 4. Update Branding
   */
  async updateBranding(tenantId: string, dto: UpdateTenantBrandingDto) {
    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(dto.name.trim());
    }
    if (dto.logoUrl !== undefined) {
      updates.push(`logo_url = $${idx++}`);
      values.push(dto.logoUrl.trim() || null);
    }
    if (dto.receiptHeader !== undefined) {
      updates.push(`receipt_header = $${idx++}`);
      values.push(dto.receiptHeader.trim());
    }
    if (dto.receiptFooter !== undefined) {
      updates.push(`receipt_footer = $${idx++}`);
      values.push(dto.receiptFooter.trim());
    }
    if (dto.defaultLanguage !== undefined) {
      updates.push(`default_language = $${idx++}`);
      values.push(dto.defaultLanguage);
    }
    if (dto.vatSettings !== undefined) {
      updates.push(`vat_settings = $${idx++}`);
      values.push(JSON.stringify(dto.vatSettings));
    }

    if (updates.length === 0) {
      return this.getBranding(tenantId);
    }

    updates.push(`updated_at = clock_timestamp()`);
    values.push(tenantId);

    await this.db.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx}`,
      values,
      tenantId,
    );

    return this.getBranding(tenantId);
  }
}
