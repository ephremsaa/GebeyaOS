import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import {
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  CreateGrnDto,
} from './dto/purchasing.dto';

@Controller('api/purchasing')
export class PurchasingController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post('suppliers')
  @HttpCode(HttpStatus.CREATED)
  async createSupplier(@Body() dto: CreateSupplierDto) {
    return this.purchasingService.createSupplier(dto);
  }

  @Get('suppliers')
  async listSuppliers() {
    return this.purchasingService.listSuppliers();
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createPurchaseOrder(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000041';
    return this.purchasingService.createPurchaseOrder(actorId, dto);
  }

  @Get('orders')
  async listPurchaseOrders(@Query('branch_id') branchId?: string) {
    return this.purchasingService.listPurchaseOrders(branchId);
  }

  @Post('grn')
  @HttpCode(HttpStatus.CREATED)
  async processGrn(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateGrnDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000041';
    return this.purchasingService.processGrn(actorId, dto);
  }
}
