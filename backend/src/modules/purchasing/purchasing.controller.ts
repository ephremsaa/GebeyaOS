import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
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
  ApprovePurchaseOrderDto,
  RecordSupplierPaymentDto,
  CreateSupplierReturnDto,
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

  @Get('orders/:id')
  async getPurchaseOrderById(@Param('id') id: string) {
    return this.purchasingService.getPurchaseOrderById(id);
  }

  @Patch('orders/:id/status')
  async updatePOStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.purchasingService.updatePOStatus(id, status);
  }

  @Post('orders/:id/approve')
  async approvePurchaseOrder(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: ApprovePurchaseOrderDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000041';
    return this.purchasingService.approvePurchaseOrder(actorId, id, dto.manager_pin);
  }

  @Post('orders/:id/send')
  async sendPurchaseOrder(@Param('id') id: string) {
    return this.purchasingService.sendPurchaseOrder(id);
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

  @Get('grn')
  async listGRNs(@Query('branch_id') branchId?: string) {
    return this.purchasingService.listGRNs(branchId);
  }

  @Get('grn/:id')
  async getGRNById(@Param('id') id: string) {
    return this.purchasingService.getGRNById(id);
  }

  @Get('payables')
  async listPayables(@Query('branch_id') branchId?: string) {
    return this.purchasingService.listPayables(branchId);
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  async recordSupplierPayment(
    @Headers('x-user-id') userId: string,
    @Body() dto: RecordSupplierPaymentDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000041';
    return this.purchasingService.recordSupplierPayment(actorId, dto);
  }

  @Post('returns')
  @HttpCode(HttpStatus.CREATED)
  async processSupplierReturn(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateSupplierReturnDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000041';
    return this.purchasingService.processSupplierReturn(actorId, dto);
  }
}

