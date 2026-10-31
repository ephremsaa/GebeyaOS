import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncClientService } from './sync-client.service';
import { TriggerSyncDto } from './sync.dto';

@Controller(['sync', 'api/sync'])
export class SyncController {
  constructor(
    private readonly outboxService: SyncOutboxService,
    private readonly clientService: SyncClientService,
  ) {}

  @Get('status')
  async getSyncStatus(
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const outboxStatus = await this.outboxService.getOutboxStatus();
    const clientStatus = this.clientService.getSyncStatus();

    return {
      branchId,
      ...clientStatus,
      outbox: outboxStatus,
    };
  }

  @Get('outbox')
  async getOutboxEvents(@Query('limit') limit = 100) {
    return this.outboxService.getOutboxEvents(Number(limit));
  }

  @Get('inbox')
  async getInboxEvents(@Query('limit') limit = 100) {
    return this.outboxService.getInboxEvents(Number(limit));
  }

  @Get('conflicts')
  async getConflictLogs(@Query('limit') limit = 100) {
    return this.outboxService.getConflictLogs(Number(limit));
  }

  @Post('retry/:id')
  @HttpCode(HttpStatus.OK)
  async retryEvent(@Param('id') id: string) {
    const success = await this.outboxService.retryEvent(id);
    return { success, id };
  }

  @Post('retry-all')
  @HttpCode(HttpStatus.OK)
  async retryAllFailed() {
    const retriedCount = await this.outboxService.retryAllFailed();
    return { success: true, retriedCount };
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async triggerPush(
    @Body() dto: TriggerSyncDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.clientService.pushPendingEvents(branchId, dto?.limit ?? 100);
  }

  @Post('pull')
  @HttpCode(HttpStatus.OK)
  async triggerPull(
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.clientService.pullCatalogDeltas(branchId);
  }

  @Post('initial-pull')
  @HttpCode(HttpStatus.OK)
  async initialCatalogPull(
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.clientService.forceInitialCatalogPull(branchId);
  }

  @Post('trigger')
  @HttpCode(HttpStatus.OK)
  async triggerFullSync(
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    let pushResult: any = { pushedCount: 0, ackCount: 0 };
    let pullResult: any = { appliedCount: 0 };

    try {
      pushResult = await this.clientService.pushPendingEvents(branchId, 100);
    } catch {
      // Offline push handling
    }

    try {
      pullResult = await this.clientService.pullCatalogDeltas(branchId);
    } catch {
      // Offline pull handling
    }

    return {
      success: true,
      push: pushResult,
      pull: pullResult,
      status: this.clientService.getSyncStatus(),
    };
  }
}
