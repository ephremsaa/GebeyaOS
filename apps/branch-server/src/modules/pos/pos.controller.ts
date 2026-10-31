import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
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
  HoldBasketDto,
  ManagerPinVerifyDto,
  ReprintReceiptDto,
} from './pos.dto';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('shifts/current')
  async getCurrentShift(
    @Query('terminalId') terminalIdQuery?: string,
    @Headers('x-terminal-id') terminalIdHeader?: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const terminalId = terminalIdQuery || terminalIdHeader || '00000000-0000-0000-0000-000000000010';
    return this.posService.getCurrentShift(branchId, terminalId);
  }

  @Get('catalog')
  async getCatalog(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.getCatalog(branchId);
  }

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

  @Post('sales/:id/reprint')
  @HttpCode(HttpStatus.OK)
  async reprintReceipt(
    @Param('id') saleId: string,
    @Body() dto: ReprintReceiptDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const cashierId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.posService.reprintReceipt(branchId, saleId, cashierId, dto);
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

  @Post('baskets/hold')
  @HttpCode(HttpStatus.CREATED)
  async holdBasket(
    @Body() dto: HoldBasketDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const cashierId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.posService.holdBasket(branchId, cashierId, dto);
  }

  @Get('baskets/held')
  async getHeldBaskets(
    @Query('terminalId') terminalIdQuery?: string,
    @Headers('x-terminal-id') terminalIdHeader?: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const terminalId = terminalIdQuery || terminalIdHeader || '00000000-0000-0000-0000-000000000010';
    return this.posService.getHeldBaskets(branchId, terminalId);
  }

  @Post('baskets/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeHeldBasket(
    @Param('id') basketId: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.resumeHeldBasket(branchId, basketId);
  }

  @Delete('baskets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteHeldBasket(
    @Param('id') basketId: string,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.deleteHeldBasket(branchId, basketId);
  }

  @Post('auth/manager-pin')
  @HttpCode(HttpStatus.OK)
  async verifyManagerPin(
    @Body() dto: ManagerPinVerifyDto,
    @Headers('x-branch-id') branchIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.posService.verifyManagerPin(branchId, dto);
  }
}

