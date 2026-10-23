import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
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

  @Patch('orders/:id/status')
  async updatePOStatus(
    @Param('id') poId: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchasingService.updatePOStatus(poId, dto);
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

  @Get('grn/:id')
  async getGRN(@Param('id') grnId: string) {
    return this.purchasingService.getGRN(grnId);
  }
}
