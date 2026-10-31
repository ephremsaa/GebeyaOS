import { Global, Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantContextMiddleware } from './tenant-context.middleware';

@Global()
@Module({
  providers: [TenantContextService, TenantContextMiddleware],
  exports: [TenantContextService, TenantContextMiddleware],
})
export class TenantModule {}

