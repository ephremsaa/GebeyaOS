import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { DatabaseModule } from '../../common/database/database.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [DatabaseModule, InventoryModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
