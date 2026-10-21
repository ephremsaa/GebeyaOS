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
import { TransfersService } from './transfers.service';
import {
  CreateTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
} from './transfers.dto';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTransfer(
    @Body() dto: CreateTransferDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.transfersService.createTransfer(branchId, userId, dto);
  }

  @Get()
  async listTransfers(@Headers('x-branch-id') branchIdHeader?: string) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    return this.transfersService.listTransfers(branchId);
  }

  @Get(':id')
  async getTransfer(@Param('id') transferId: string) {
    return this.transfersService.getTransfer(transferId);
  }

  @Patch(':id/approve')
  async approveTransfer(
    @Param('id') transferId: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.transfersService.approveTransfer(transferId, userId);
  }

  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatchTransfer(
    @Param('id') transferId: string,
    @Body() dto: DispatchTransferDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.transfersService.dispatchTransfer(transferId, branchId, userId, dto);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  async receiveTransfer(
    @Param('id') transferId: string,
    @Body() dto: ReceiveTransferDto,
    @Headers('x-branch-id') branchIdHeader?: string,
    @Headers('x-user-id') userIdHeader?: string,
  ) {
    const branchId = branchIdHeader || process.env.BRANCH_ID || '00000000-0000-0000-0000-000000000001';
    const userId = userIdHeader || '00000000-0000-0000-0000-000000000002';
    return this.transfersService.receiveTransfer(transferId, branchId, userId, dto);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTransfer(@Param('id') transferId: string) {
    return this.transfersService.cancelTransfer(transferId);
  }
}
