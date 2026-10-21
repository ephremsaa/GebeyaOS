import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateStockAdjustmentDto,
  CreateStockTakeDto,
  RecordStockTakeCountDto,
  ReconcileStockTakeDto,
  CreateBatchDto,
  CreateMovementDto,
} from './inventory.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('stock-on-hand/:productId')
  async getStockOnHand(
    @Param('productId') productId: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.inventoryService.getStockOnHand(branchId, productId);
  }

  @Get('ledger/:productId')
  async getLedgerHistory(
    @Param('productId') productId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.inventoryService.getLedgerHistory(
      branchId,
      productId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  async createBatch(
    @Body() dto: CreateBatchDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.inventoryService.createBatch(branchId, dto);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  async recordMovement(
    @Body() dto: CreateMovementDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.inventoryService.recordMovement(branchId, {
      productId: dto.productId,
      batchId: dto.batchId,
      movementType: dto.movementType,
      quantityChange: dto.quantityChange,
      unitCost: dto.unitCost,
      referenceType: dto.referenceType,
      referenceId: dto.referenceId,
      notes: dto.notes,
      createdBy: userIdHeader || null,
    });
  }

  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  async createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.inventoryService.createAdjustment(branchId, userId, dto);
  }

  @Post('stock-takes')
  @HttpCode(HttpStatus.CREATED)
  async createStockTake(
    @Body() dto: CreateStockTakeDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.inventoryService.createStockTake(branchId, userId, dto);
  }

  @Post('stock-takes/:id/counts')
  @HttpCode(HttpStatus.OK)
  async recordStockTakeCounts(
    @Param('id') stockTakeId: string,
    @Body() dto: RecordStockTakeCountDto,
  ) {
    await this.inventoryService.recordStockTakeCounts(stockTakeId, dto);
    return { success: true, stockTakeId };
  }

  @Post('stock-takes/:id/reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcileStockTake(
    @Param('id') stockTakeId: string,
    @Body() dto: ReconcileStockTakeDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.inventoryService.reconcileStockTake(stockTakeId, userId, dto);
  }
}
