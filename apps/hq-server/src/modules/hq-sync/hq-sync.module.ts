import { Module } from '@nestjs/common';
import { HqSyncController } from './hq-sync.controller';
import { HqSyncService } from './hq-sync.service';
import { DatabaseModule } from '../../common/database/database.module';
import { BranchAuthGuard } from '../../common/guards/branch-auth.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [HqSyncController],
  providers: [HqSyncService, BranchAuthGuard],
  exports: [HqSyncService],
})
export class HqSyncModule {}
