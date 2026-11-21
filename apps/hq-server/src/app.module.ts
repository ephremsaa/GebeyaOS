import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { HqSyncModule } from './modules/hq-sync/hq-sync.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HqSyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
