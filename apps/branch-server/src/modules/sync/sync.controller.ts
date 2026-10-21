import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncClientService } from './sync-client.service';
import { TriggerSyncDto } from './sync.dto';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly outboxService: SyncOutboxService,
    private readonly clientService: SyncClientService,
  ) {}

  @Get('status')
  async getSyncStatus() {
    const outboxStatus = await this.outboxService.getOutboxStatus();
    const clientStatus = this.clientService.getSyncStatus();

    return {
      ...clientStatus,
      outbox: outboxStatus,
    };
  }

  @Post('push')
  @HttpCode(HttpStatus.OK)
  async triggerPush(
    @Body() dto: TriggerSyncDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.clientService.pushPendingEvents(branchId, dto.limit ?? 100);
  }

  @Post('pull')
  @HttpCode(HttpStatus.OK)
  async triggerPull(
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.clientService.pullCatalogDeltas(branchId);
  }
}
