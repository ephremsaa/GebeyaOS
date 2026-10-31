import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { PlatformAdminService } from './platform-admin.service';
import { TenantExportService } from './tenant-export.service';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminGuard } from './guards/platform-admin.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, TenantExportService, PlatformAdminGuard],
  exports: [PlatformAdminService, TenantExportService, PlatformAdminGuard],
})
export class PlatformAdminModule {}

