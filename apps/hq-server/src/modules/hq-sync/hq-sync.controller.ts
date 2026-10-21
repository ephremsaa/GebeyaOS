import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HqSyncService } from './hq-sync.service';
import { SyncBatchPushRequest } from '@gebeyaos/sync-protocol';

@Controller('sync')
export class HqSyncController {
  constructor(private readonly hqSyncService: HqSyncService) {}

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async processPush(@Body() req: SyncBatchPushRequest) {
    return this.hqSyncService.processBranchPush(req);
  }

  @Get('pull/catalog')
  async getCatalogDeltas(
    @Query('branchId') branchId: string,
    @Query('lastSyncedAt') lastSyncedAt?: string,
    @Query('limit') limit?: string,
  ) {
    return this.hqSyncService.getCatalogDeltas(
      branchId,
      lastSyncedAt || null,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
