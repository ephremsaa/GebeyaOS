import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Param,
  Headers,
  Ip,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SystemService } from './system.service';
import {
  UpdateSystemSettingDto,
  AuditLogQueryDto,
  CreateAuditLogDto,
  RestoreBackupDto,
} from './system.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller(['system', 'api/system'])
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('dashboard-summary')
  async getDashboardSummary(
    @Headers('x-branch-id') branchIdHeader?: string,
    @Query('branchId') branchIdQuery?: string,
  ) {
    const branchId = branchIdQuery || branchIdHeader || process.env.BRANCH_ID || 'ALL';
    return this.systemService.getDashboardSummary(branchId);
  }

  @Get('settings')
  async getSettings(@Headers('x-branch-id') branchIdHeader?: string) {
    const isAll = !branchIdHeader || branchIdHeader.toUpperCase() === 'ALL' || branchIdHeader === '00000000-0000-0000-0000-000000000001';
    const branchId = isAll ? (process.env.BRANCH_ID || '01a19309-1d43-7444-b260-5b2ffac3e40c') : branchIdHeader;
    return this.systemService.getSettings(branchId);
  }

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async saveSetting(
    @Body() dto: UpdateSystemSettingDto,
    @Headers('x-user-id') userIdHeader?: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const isAll = !branchIdHeader || branchIdHeader.toUpperCase() === 'ALL' || branchIdHeader === '00000000-0000-0000-0000-000000000001';
    const branchId = isAll ? (process.env.BRANCH_ID || '01a19309-1d43-7444-b260-5b2ffac3e40c') : branchIdHeader;
    await this.systemService.saveSetting(dto, userIdHeader, branchId);
    return { success: true, key: dto.key };
  }

  @Get('audit-logs')
  async getAuditLogs(@Query() query: AuditLogQueryDto) {
    return this.systemService.getAuditLogs(query);
  }

  @Post('audit-logs')
  @HttpCode(HttpStatus.CREATED)
  async logAction(
    @Body() dto: CreateAuditLogDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
    @Ip() ip?: string,
  ) {
    await this.systemService.logAction(dto, branchIdHeader, userIdHeader, ip);
    return { success: true };
  }

  @Get('notifications')
  async getNotifications(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.systemService.getNotifications(branchId);
  }

  @Get('notifications/unread-count')
  async getUnreadNotificationsCount(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.systemService.getUnreadNotificationsCount(branchId);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  async markNotificationRead(@Param('id') id: string) {
    await this.systemService.markNotificationAsRead(id);
    return { success: true };
  }

  @Post('notifications/:id/snooze')
  @HttpCode(HttpStatus.OK)
  async snoozeNotification(
    @Param('id') id: string,
    @Body() dto: { days?: number },
  ) {
    await this.systemService.snoozeNotification(id, dto.days || 7);
    return { success: true, snoozedDays: dto.days || 7 };
  }

  @Post('notifications/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  async dismissNotification(@Param('id') id: string) {
    await this.systemService.dismissNotification(id);
    return { success: true };
  }

  @Post('notifications/dismiss-all')
  @HttpCode(HttpStatus.OK)
  async dismissAllNotifications(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    await this.systemService.dismissAllNotifications(branchId);
    return { success: true };
  }

  @Get('backup')
  async createBackup(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.systemService.createBackup(branchId);
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  async restoreBackup(
    @Body() dto: RestoreBackupDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    return this.systemService.restoreBackup(dto, userIdHeader);
  }

  @Post('reset-data')
  @HttpCode(HttpStatus.OK)
  async resetTenantData(
    @Body() dto: { confirmationTenantName: string; deleteProducts?: boolean },
    @Headers('x-tenant-id') tenantIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const tenantId = tenantIdHeader || '01900000-0000-7000-8000-000000000001';
    return this.systemService.resetTenantData(tenantId, dto.deleteProducts, userIdHeader);
  }

  @Get('terminals')
  async listTerminals(@Headers('x-branch-id') branchIdHeader?: string) {
    return this.systemService.listTerminals(branchIdHeader);
  }

  @Post('terminals')
  @HttpCode(HttpStatus.CREATED)
  async createTerminal(
    @Body() dto: { code: string; name: string; deviceType?: string; ipAddress?: string; branchId?: string },
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = dto.branchId || branchIdHeader || '00000000-0000-0000-0000-000000000001';
    return this.systemService.createTerminal({
      ...dto,
      branchId,
    });
  }
}
