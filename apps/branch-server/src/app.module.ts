import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './common/database/database.module';
import { TenantModule } from './common/tenant/tenant.module';
import { SecurityModule } from './common/security/security.module';
import { TenantContextMiddleware } from './common/tenant/tenant-context.middleware';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PosModule } from './modules/pos/pos.module';
import { PurchasingModule } from './modules/purchasing/purchasing.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SyncModule } from './modules/sync/sync.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { SystemModule } from './modules/system/system.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { BranchActivationModule } from './modules/branch-activation/branch-activation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TenantModule,
    SecurityModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    InventoryModule,
    PosModule,
    PurchasingModule,
    TransfersModule,
    ReportsModule,
    SyncModule,
    SystemModule,
    PlatformAdminModule,
    OnboardingModule,
    BranchActivationModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
