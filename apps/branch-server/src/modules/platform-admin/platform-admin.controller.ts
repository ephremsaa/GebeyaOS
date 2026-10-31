import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Headers,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { Response } from 'express';
import { PlatformAdminService } from './platform-admin.service';
import {
  PlatformLoginDto,
  CreateTenantDto,
  UpdateTenantStatusDto,
  SupportAccessRequestDto,
  DeleteTenantDto,
  Platform2FAVerifyDto,
  PlatformRefreshDto,
  PlatformChangePasswordDto,
  PlatformReauthDto,
  PlatformUpdatePlanDto,
} from './dto/platform-admin.dto';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import {
  PlatformLoginResponse,
  PlatformLoginInitResponse,
  TenantUsageSummary,
  CreatedTenantResult,
  SupportAccessSession,
  PlatformAuditLogEntry,
} from '@gebeyaos/shared-types';

@Controller(['platform', 'api/platform'])
export class PlatformAdminController {
  constructor(private readonly platformAdminService: PlatformAdminService) {}

  @Post('login')
  async login(
    @Body() dto: PlatformLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<PlatformLoginInitResponse> {
    return this.platformAdminService.login(dto, ip, userAgent);
  }

  @Post('2fa/verify')
  async verify2Fa(
    @Body() dto: Platform2FAVerifyDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<PlatformLoginResponse> {
    return this.platformAdminService.verify2Fa(dto, ip, userAgent);
  }

  @Post('refresh')
  async refresh(
    @Body() dto: PlatformRefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<PlatformLoginResponse> {
    return this.platformAdminService.refreshSession(dto.refreshToken, ip, userAgent);
  }

  @Post('logout')
  @UseGuards(PlatformAdminGuard)
  async logout(
    @Req() req: any,
    @Body() dto: Partial<PlatformRefreshDto>,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.platformAdminService.logout(req.platformAdmin.id, dto.refreshToken, ip);
  }

  @Post('logout-all')
  @UseGuards(PlatformAdminGuard)
  async logoutAll(@Req() req: any, @Ip() ip: string): Promise<{ message: string }> {
    return this.platformAdminService.logoutAll(req.platformAdmin.id, ip);
  }

  @Post('change-password')
  @UseGuards(PlatformAdminGuard)
  async changePassword(
    @Body() dto: PlatformChangePasswordDto,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.platformAdminService.changePassword(req.platformAdmin.id, dto, ip);
  }

  @Post('reauth')
  @UseGuards(PlatformAdminGuard)
  async reauth(
    @Body() dto: PlatformReauthDto,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<{ success: boolean; reauthToken: string; expiresIn: number }> {
    return this.platformAdminService.reauth(req.platformAdmin.id, dto, ip);
  }

  @Get('sessions')
  @UseGuards(PlatformAdminGuard)
  async getSessions(@Req() req: any) {
    return this.platformAdminService.listSessions(
      req.platformAdmin.id,
      req.platformAdmin.familyId,
    );
  }

  @Delete('sessions/:id')
  @UseGuards(PlatformAdminGuard)
  async revokeSession(
    @Param('id') sessionId: string,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.platformAdminService.revokeSession(req.platformAdmin.id, sessionId, ip);
  }

  @Get('me')
  @UseGuards(PlatformAdminGuard)
  async getMe(@Req() req: any) {
    return { admin: req.platformAdmin };
  }

  @Get('tenants')
  @UseGuards(PlatformAdminGuard)
  async getTenants(): Promise<TenantUsageSummary[]> {
    return this.platformAdminService.getTenants();
  }

  @Post('tenants')
  @UseGuards(PlatformAdminGuard)
  async createTenant(
    @Body() dto: CreateTenantDto,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<CreatedTenantResult> {
    return this.platformAdminService.createTenant(dto, req.platformAdmin.id, ip);
  }

  @Patch('tenants/:id/status')
  @UseGuards(PlatformAdminGuard)
  async updateTenantStatus(
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
    @Req() req: any,
    @Ip() ip: string,
    @Headers('x-reauth-token') reauthToken?: string,
  ): Promise<TenantUsageSummary> {
    return this.platformAdminService.updateTenantStatus(
      tenantId,
      dto.status,
      req.platformAdmin.id,
      ip,
      reauthToken,
    );
  }

  @Patch('tenants/:id/plan')
  @UseGuards(PlatformAdminGuard)
  async updateTenantPlan(
    @Param('id') tenantId: string,
    @Body() dto: PlatformUpdatePlanDto,
    @Req() req: any,
    @Ip() ip: string,
    @Headers('x-reauth-token') reauthToken?: string,
  ): Promise<TenantUsageSummary> {
    return this.platformAdminService.updateTenantPlan(
      tenantId,
      dto.plan,
      req.platformAdmin.id,
      ip,
      reauthToken,
    );
  }

  @Post('tenants/:id/reset-owner')
  @UseGuards(PlatformAdminGuard)
  async resetOwnerAccess(
    @Param('id') tenantId: string,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<{ message: string; inviteToken: string; inviteLink: string }> {
    return this.platformAdminService.resetOwnerAccess(
      tenantId,
      req.platformAdmin.id,
      ip,
    );
  }

  @Post('tenants/:id/support-access')
  @UseGuards(PlatformAdminGuard)
  async requestSupportAccess(
    @Param('id') tenantId: string,
    @Body() dto: SupportAccessRequestDto,
    @Req() req: any,
    @Ip() ip: string,
    @Headers('x-reauth-token') reauthToken?: string,
  ): Promise<SupportAccessSession> {
    return this.platformAdminService.requestSupportAccess(
      tenantId,
      dto,
      req.platformAdmin.id,
      ip,
      reauthToken,
    );
  }

  @Delete('support-access/:id')
  @UseGuards(PlatformAdminGuard)
  async revokeSupportAccess(
    @Param('id') accessId: string,
    @Req() req: any,
    @Ip() ip: string,
  ): Promise<{ message: string }> {
    return this.platformAdminService.revokeSupportAccess(
      accessId,
      req.platformAdmin.id,
      ip,
    );
  }

  @Get('audit-logs')
  @UseGuards(PlatformAdminGuard)
  async getAuditLogs(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PlatformAuditLogEntry[]> {
    return this.platformAdminService.getAuditLogs(
      tenantId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get('tenants/:id/export')
  @UseGuards(PlatformAdminGuard)
  async exportTenantData(
    @Param('id') tenantId: string,
    @Req() req: any,
    @Res() res: Response,
    @Ip() ip: string,
  ): Promise<void> {
    const result = await this.platformAdminService.exportTenantData(
      tenantId,
      req.platformAdmin.id,
      ip,
    );

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.end(result.buffer);
  }

  @Delete('tenants/:id')
  @UseGuards(PlatformAdminGuard)
  async deleteTenant(
    @Param('id') tenantId: string,
    @Body() dto: DeleteTenantDto,
    @Req() req: any,
    @Ip() ip: string,
    @Headers('x-reauth-token') reauthToken?: string,
  ): Promise<{ message: string; tenantId: string }> {
    return this.platformAdminService.deleteTenant(
      tenantId,
      dto.confirmationCode,
      req.platformAdmin.id,
      ip,
      reauthToken,
    );
  }
}
