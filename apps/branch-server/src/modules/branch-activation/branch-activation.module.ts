import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { BranchActivationService } from './branch-activation.service';
import { BranchActivationController } from './branch-activation.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [BranchActivationController],
  providers: [BranchActivationService],
  exports: [BranchActivationService],
})
export class BranchActivationModule {}

