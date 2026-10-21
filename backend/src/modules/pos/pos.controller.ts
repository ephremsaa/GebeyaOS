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
import { HeldCartsService } from './domain/held-carts.service';
import {
  OpenShiftDto,
  CloseShiftDto,
  CashMovementDto,
  CreateSaleDto,
  CreateRefundDto,
  HoldCartDto,
  ReprintReceiptDto,
} from './dto/pos.dto';

@Controller('api/pos')
export class PosController {
  constructor(
    private readonly posService: PosService,
    private readonly heldCartsService: HeldCartsService,
  ) {}

  @Post('shifts/open')
  @HttpCode(HttpStatus.CREATED)
  async openShift(
    @Headers('x-user-id') userId: string,
    @Body() dto: OpenShiftDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.openShift(cashierId, dto);
  }

  @Post('shifts/:id/cash-movement')
  @HttpCode(HttpStatus.CREATED)
  async recordCashMovement(
    @Param('id') shiftId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CashMovementDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.recordCashMovement(shiftId, cashierId, dto);
  }

  @Post('shifts/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeShift(
    @Param('id') shiftId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: CloseShiftDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.closeShift(shiftId, cashierId, dto);
  }

  @Post('sales')
  @HttpCode(HttpStatus.CREATED)
  async processSale(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateSaleDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.processSale(cashierId, dto);
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  async processRefund(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateRefundDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.processRefund(cashierId, dto);
  }

  @Post('sales/:id/reprint')
  @HttpCode(HttpStatus.OK)
  async reprintReceipt(
    @Param('id') saleId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: ReprintReceiptDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.posService.reprintReceipt(saleId, cashierId, dto);
  }

  @Post('carts/hold')
  @HttpCode(HttpStatus.CREATED)
  async holdCart(
    @Headers('x-user-id') userId: string,
    @Body() dto: HoldCartDto,
  ) {
    const cashierId = userId || '018e0000-0000-7000-8000-000000000042';
    return this.heldCartsService.holdCart(
      dto.terminal_id,
      cashierId,
      dto.items,
      dto.customer_identifier,
    );
  }

  @Get('carts/held/:terminalId')
  async getHeldCarts(@Param('terminalId') terminalId: string) {
    return this.heldCartsService.getHeldCarts(terminalId);
  }

  @Post('carts/resume/:cartId')
  @HttpCode(HttpStatus.OK)
  async resumeCart(@Param('cartId') cartId: string) {
    return this.heldCartsService.resumeCart(cartId);
  }
}
