import { Module } from '@nestjs/common';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncInboxService } from './sync-inbox.service';
import { SyncCoordinatorService } from './sync-coordinator.service';
import { SyncController } from './sync.controller';

@Module({
  controllers: [SyncController],
  providers: [SyncOutboxService, SyncInboxService, SyncCoordinatorService],
  exports: [SyncOutboxService, SyncInboxService, SyncCoordinatorService],
})
export class SyncModule {}
