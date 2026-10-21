import { Module } from '@nestjs/common';
import { HqSyncController } from './hq-sync.controller';
import { HqSyncService } from './hq-sync.service';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [HqSyncController],
  providers: [HqSyncService],
  exports: [HqSyncService],
})
export class HqSyncModule {}
