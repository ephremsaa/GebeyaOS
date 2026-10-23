import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { ExcelImportController } from './import/excel-import.controller';
import { ExcelImportService } from './import/excel-import.service';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [InventoryController, ExcelImportController],
  providers: [InventoryService, ExcelImportService],
  exports: [InventoryService, ExcelImportService],
})
export class InventoryModule {}
