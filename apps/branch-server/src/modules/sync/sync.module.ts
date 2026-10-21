import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncOutboxService } from './sync-outbox.service';
import { SyncClientService } from './sync-client.service';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SyncController],
  providers: [SyncOutboxService, SyncClientService],
  exports: [SyncOutboxService, SyncClientService],
})
export class SyncModule {}
