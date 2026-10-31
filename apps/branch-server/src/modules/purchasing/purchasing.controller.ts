import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PurchasingService } from './purchasing.service';
import {
  CreateSupplierDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
  CreateGRNDto,
  ApprovePurchaseOrderDto,
  RecordSupplierPaymentDto,
  CreateSupplierReturnDto,
} from './purchasing.dto';

@Controller(['purchasing', 'api/purchasing'])
export class PurchasingController {
  constructor(private readonly purchasingService: PurchasingService) {}

  @Post('suppliers')
  @HttpCode(HttpStatus.CREATED)
  async createSupplier(@Body() dto: CreateSupplierDto) {
    return this.purchasingService.createSupplier(dto);
  }

  @Get('suppliers')
  async getSuppliers() {
    return this.purchasingService.getSuppliers();
  }

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.purchasingService.createPurchaseOrder(branchId, userId, dto);
  }

  @Get('orders')
  async getPurchaseOrders(@Query('branch_id') branchId?: string) {
    return this.purchasingService.getPurchaseOrders(branchId);
  }

  @Get('orders/:id')
  async getPurchaseOrder(@Param('id') poId: string) {
    return this.purchasingService.getPurchaseOrder(poId);
  }

  @Patch('orders/:id/status')
  async updatePOStatus(
    @Param('id') poId: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchasingService.updatePOStatus(poId, dto);
  }

  @Post('orders/:id/approve')
  async approvePurchaseOrder(
    @Param('id') poId: string,
    @Body() dto: ApprovePurchaseOrderDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.purchasingService.approvePurchaseOrder(userId, poId, dto.managerPin);
  }

  @Post('orders/:id/send')
  async sendPurchaseOrder(@Param('id') poId: string) {
    return this.purchasingService.sendPurchaseOrder(poId);
  }

  @Post('grn')
  @HttpCode(HttpStatus.CREATED)
  async createGRN(
    @Body() dto: CreateGRNDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.purchasingService.createGRN(branchId, userId, dto);
  }

  @Get('grn')
  async getGRNList(@Query('branch_id') branchId?: string) {
    return this.purchasingService.getGRNList(branchId);
  }

  @Get('grn/:id')
  async getGRN(@Param('id') grnId: string) {
    return this.purchasingService.getGRN(grnId);
  }

  @Get('payables')
  async listPayables(@Query('branch_id') branchId?: string) {
    return this.purchasingService.listPayables(branchId);
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  async recordSupplierPayment(
    @Body() dto: RecordSupplierPaymentDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.purchasingService.recordSupplierPayment(userId, dto);
  }

  @Post('returns')
  @HttpCode(HttpStatus.CREATED)
  async processSupplierReturn(
    @Body() dto: CreateSupplierReturnDto,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.purchasingService.processSupplierReturn(userId, dto);
  }
}

