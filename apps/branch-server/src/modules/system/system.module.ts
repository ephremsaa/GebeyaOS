import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';
import { HealthController } from './health.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SystemController, HealthController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
