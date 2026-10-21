import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateAdjustmentDto,
  StartStockTakeDto,
  RecordStockTakeCountsDto,
  ReconcileStockTakeDto,
} from './dto/inventory.dto';

@Controller('api/inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('balance/:branchId/:productId')
  async getBalance(
    @Param('branchId') branchId: string,
    @Param('productId') productId: string,
  ) {
    return this.inventoryService.getStockBalance(branchId, productId);
  }

  @Get('expiring/:branchId')
  async getExpiring(
    @Param('branchId') branchId: string,
    @Query('days') days?: number,
  ) {
    const withinDays = days ? Number(days) : 30;
    return this.inventoryService.getExpiringBatches(branchId, withinDays);
  }

  @Get('low-stock/:branchId')
  async getLowStock(@Param('branchId') branchId: string) {
    return this.inventoryService.getLowStockAlerts(branchId);
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  async createAdjustment(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000001';
    return this.inventoryService.createAdjustment(actorId, dto);
  }

  @Post('stock-takes')
  @HttpCode(HttpStatus.CREATED)
  async startStockTake(
    @Headers('x-user-id') userId: string,
    @Body() dto: StartStockTakeDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000001';
    return this.inventoryService.startStockTake(actorId, dto);
  }

  @Post('stock-takes/:id/counts')
  @HttpCode(HttpStatus.OK)
  async recordCounts(
    @Param('id') stockTakeId: string,
    @Body() dto: RecordStockTakeCountsDto,
  ) {
    await this.inventoryService.recordStockTakeCounts(stockTakeId, dto);
    return { success: true };
  }

  @Post('stock-takes/:id/reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile(
    @Param('id') stockTakeId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: ReconcileStockTakeDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000001';
    return this.inventoryService.reconcileStockTake(stockTakeId, actorId, dto);
  }
}
