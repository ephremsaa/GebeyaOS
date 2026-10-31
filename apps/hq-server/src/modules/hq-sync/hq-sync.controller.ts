import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { HqSyncService } from './hq-sync.service';
import { SyncBatchPushRequest } from '@gebeyaos/sync-protocol';
import { BranchAuthGuard } from '../../common/guards/branch-auth.guard';

@Controller('sync')
export class HqSyncController {
  constructor(private readonly hqSyncService: HqSyncService) {}

  @Post('push')
  @UseGuards(BranchAuthGuard)
  @HttpCode(HttpStatus.OK)
  async processPush(@Body() req: SyncBatchPushRequest, @Req() httpReq: any) {
    const authBranch = httpReq.branch;
    return this.hqSyncService.processBranchPush(
      req,
      authBranch?.tenantId,
      authBranch?.branchId,
    );
  }

  @Get('pull/catalog')
  @UseGuards(BranchAuthGuard)
  async getCatalogDeltas(
    @Query('branchId') branchId: string,
    @Query('lastSyncedAt') lastSyncedAt?: string,
    @Query('limit') limit?: string,
    @Req() httpReq?: any,
  ) {
    const authBranch = httpReq?.branch;
    return this.hqSyncService.getCatalogDeltas(
      branchId || authBranch?.branchId,
      lastSyncedAt || null,
      limit ? parseInt(limit, 10) : 100,
      authBranch?.tenantId,
    );
  }
}
