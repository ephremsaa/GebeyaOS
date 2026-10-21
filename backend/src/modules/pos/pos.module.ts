import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { HeldCartsService } from './domain/held-carts.service';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [InventoryModule, ProductsModule],
  controllers: [PosController],
  providers: [PosService, HeldCartsService],
  exports: [PosService, HeldCartsService],
})
export class PosModule {}
