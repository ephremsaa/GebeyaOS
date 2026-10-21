import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { FefoAllocatorService } from './domain/fefo-allocator.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, FefoAllocatorService],
  exports: [InventoryService, FefoAllocatorService],
})
export class InventoryModule {}
