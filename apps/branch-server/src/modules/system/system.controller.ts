import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
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
  async getDashboardSummary(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.systemService.getDashboardSummary(branchId);
  }

  @Get('settings')
  async getSettings(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.systemService.getSettings(branchId);
  }

  @Put('settings')
  @HttpCode(HttpStatus.OK)
  async saveSetting(
    @Body() dto: UpdateSystemSettingDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    await this.systemService.saveSetting(dto, userIdHeader);
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
