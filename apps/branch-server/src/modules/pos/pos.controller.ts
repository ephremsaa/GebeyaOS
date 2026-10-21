import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PosService } from './pos.service';
import {
  OpenShiftDto,
  RecordCashMovementDto,
  CloseShiftDto,
  CreateSaleDto,
  CreateSaleRefundDto,
} from './pos.dto';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('shifts/open')
  @HttpCode(HttpStatus.CREATED)
  async openShift(
    @Body() dto: OpenShiftDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const cashierId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.posService.openShift(branchId, cashierId, dto);
  }

  @Post('shifts/:id/cash-drop')
  @HttpCode(HttpStatus.CREATED)
  async recordCashMovement(
    @Param('id') shiftId: string,
    @Body() dto: RecordCashMovementDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.recordCashMovement(branchId, shiftId, dto);
  }

  @Get('shifts/:id/x-report')
  async getXReport(
    @Param('id') shiftId: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.getXReport(branchId, shiftId);
  }

  @Post('shifts/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeShift(
    @Param('id') shiftId: string,
    @Body() dto: CloseShiftDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.closeShift(branchId, shiftId, dto);
  }

  @Post('sales')
  @HttpCode(HttpStatus.CREATED)
  async checkoutSale(
    @Body() dto: CreateSaleDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const cashierId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.posService.checkoutSale(branchId, cashierId, dto);
  }

  @Get('sales/receipt/:receiptNumber')
  async getSaleByReceiptNumber(
    @Param('receiptNumber') receiptNumber: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.getSaleByReceiptNumber(branchId, receiptNumber);
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  async refundSale(
    @Body() dto: CreateSaleRefundDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const cashierId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.posService.refundSale(branchId, cashierId, dto);
  }
}
