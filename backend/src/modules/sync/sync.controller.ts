import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncInboxService } from './sync-inbox.service';
import { SyncCoordinatorService } from './sync-coordinator.service';
import { SyncBatchPayload } from './domain/sync.types';

@Controller('api/sync')
export class SyncController {
  constructor(
    private readonly outboxService: SyncOutboxService,
    private readonly inboxService: SyncInboxService,
    private readonly coordinatorService: SyncCoordinatorService,
  ) {}

  /**
   * Central HQ endpoint: Ingests batch of events pushed by a branch.
   */
  @Post('push')
  @HttpCode(HttpStatus.OK)
  async pushBatch(@Body() payload: SyncBatchPayload) {
    return this.inboxService.ingestBranchBatch(payload);
  }

  /**
   * Branch endpoint: Triggers an on-demand outbox drain to Central HQ.
   */
  @Post('trigger/:branchId')
  @HttpCode(HttpStatus.OK)
  async triggerSync(@Param('branchId') branchId: string) {
    return this.coordinatorService.triggerBranchSync(branchId);
  }

  /**
   * Status endpoint: Returns pending outbox count, last sync sequence, and freshness.
   */
  @Get('status/:branchId')
  async getStatus(@Param('branchId') branchId: string) {
    return this.outboxService.getStreamStatus(branchId);
  }
}
