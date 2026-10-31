import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { DatabaseService } from '../../common/database/database.service';
import { JWT_SECRET } from '../../common/guards/jwt-auth.guard';
import { generateUuidV7, BranchSyncTokenPayload } from '@gebeyaos/shared-types';
import {
  GenerateActivationCodeDto,
  ActivateBranchDto,
} from './dto/branch-activation.dto';

@Injectable()
export class BranchActivationService {
  private readonly logger = new Logger(BranchActivationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Helper: Generate human-friendly 8-char uppercase code (excluding ambiguous chars 0, O, I, 1)
   */
  private generateReadableCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  /**
   * 1. Generate a single-use branch activation code (Owner / HQ Manager)
   */
  async generateCode(
    dto: GenerateActivationCodeDto,
    userId: string,
    tenantId: string,
  ) {
    // Verify plan limits
    const tenantRes = await this.db.query(
      `SELECT max_branches, status FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (tenantRes.rows.length === 0) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenantRes.rows[0].status === 'suspended') {
      throw new ForbiddenException('Cannot generate activation codes for a suspended tenant');
    }

    const branchCountRes = await this.db.query(
      `SELECT COUNT(*)::int as count FROM branches WHERE tenant_id = $1`,
      [tenantId],
    );

    const maxBranches = Number(tenantRes.rows[0].max_branches);
    const currentBranches = Number(branchCountRes.rows[0].count);

    if (currentBranches >= maxBranches) {
      throw new ForbiddenException(
        `Branch limit reached (${currentBranches}/${maxBranches}). Upgrade your subscription plan to add more branches.`,
      );
    }

    const code = this.generateReadableCode();
    const hours = dto.expiresInHours || 72;
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    const codeId = generateUuidV7();

    await this.db.query(
      `INSERT INTO branch_activation_codes (
        id, tenant_id, code, branch_name, expires_at, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [codeId, tenantId, code, dto.branchName.trim(), expiresAt, userId],
      tenantId,
    );

    return {
      id: codeId,
      code,
      branchName: dto.branchName.trim(),
      expiresAt: expiresAt.toISOString(),
      expiresInHours: hours,
    };
  }

  /**
   * 2. List active activation codes for this tenant
   */
  async listCodes(tenantId: string) {
    const res = await this.db.query(
      `SELECT id, code, branch_name, used_at, expires_at, created_at
       FROM branch_activation_codes
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
      tenantId,
    );

    return res.rows.map((row) => ({
      id: row.id,
      code: row.code,
      branchName: row.branch_name,
      usedAt: row.used_at ? new Date(row.used_at).toISOString() : null,
      expiresAt: new Date(row.expires_at).toISOString(),
      isExpired: new Date(row.expires_at) < new Date(),
      isUsed: row.used_at !== null,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  /**
   * 3. Activate a new branch LAN server using a one-time activation code
   */
  async activateBranch(dto: ActivateBranchDto) {
    const cleanCode = dto.activationCode.trim().toUpperCase();

    const res = await this.db.query(
      `SELECT bac.id, bac.tenant_id, bac.code, bac.branch_name, bac.used_at, bac.expires_at,
              t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
              t.max_branches, t.tin_number, t.receipt_header, t.receipt_footer
       FROM branch_activation_codes bac
       JOIN tenants t ON t.id = bac.tenant_id
       WHERE bac.code = $1`,
      [cleanCode],
    );

    if (res.rows.length === 0) {
      throw new NotFoundException('Invalid branch activation code');
    }

    const bac = res.rows[0];

    if (bac.used_at !== null) {
      throw new BadRequestException('This branch activation code has already been used');
    }

    if (new Date(bac.expires_at) < new Date()) {
      throw new BadRequestException('This branch activation code has expired. Please request a new code from the store owner.');
    }

    if (bac.tenant_status === 'suspended') {
      throw new ForbiddenException('Tenant account is suspended. Branch activation is disabled.');
    }

    const tenantId = bac.tenant_id;

    // Enforce branch quota
    const branchCountRes = await this.db.query(
      `SELECT COUNT(*)::int as count FROM branches WHERE tenant_id = $1`,
      [tenantId],
    );

    if (Number(branchCountRes.rows[0].count) >= Number(bac.max_branches)) {
      throw new ForbiddenException(
        `Subscription plan branch limit reached (${branchCountRes.rows[0].count}/${bac.max_branches}).`,
      );
    }

    return await this.db.withTransaction(async (client) => {
      await client.query(`SELECT set_tenant_context($1)`, [tenantId]);

      const branchId = generateUuidV7();
      const branchCode = (
        dto.branchCode ||
        'BR-' + crypto.randomBytes(3).toString('hex').toUpperCase()
      ).trim();

      // Create branch
      await client.query(
        `INSERT INTO branches (
          id, tenant_id, code, name, trade_name, tin_number, phone, city, is_hq, settings
         ) VALUES ($1, $2, $3, $4, $5, $6, '011000000', 'Addis Ababa', FALSE, $7)`,
        [
          branchId,
          tenantId,
          branchCode,
          bac.branch_name,
          bac.tenant_name,
          bac.tin_number || '0000000000',
          JSON.stringify({
            currency: 'ETB',
            default_vat_rate: 0.15,
            allow_negative_stock: false,
          }),
        ],
      );

      // Create default terminal for this branch
      const terminalId = generateUuidV7();
      await client.query(
        `INSERT INTO terminals (id, tenant_id, branch_id, code, name, device_type, ip_address, is_active)
         VALUES ($1, $2, $3, 'POS-01', 'Lane 1 Express', 'POS_STATION', $4, TRUE)`,
        [terminalId, tenantId, branchId, dto.serverIp || '127.0.0.1'],
      );

      // Mark code as used
      await client.query(
        `UPDATE branch_activation_codes
         SET used_at = clock_timestamp()
         WHERE id = $1`,
        [bac.id],
      );

      // Generate branch sync credential token
      const syncPayload: BranchSyncTokenPayload = {
        sub: branchId,
        branchId,
        tenantId,
        type: 'BRANCH_SYNC',
      };

      const syncSecret = process.env.BRANCH_SYNC_SECRET || 'gebeyaos-branch-sync-secret-2026';
      const syncToken = jwt.sign(syncPayload, syncSecret, { expiresIn: '365d' });

      return {
        success: true,
        branchId,
        branchCode,
        branchName: bac.branch_name,
        tenantId,
        tenantSlug: bac.tenant_slug,
        tenantName: bac.tenant_name,
        syncToken,
        receiptHeader: bac.receipt_header,
        receiptFooter: bac.receipt_footer,
      };
    });
  }
}
