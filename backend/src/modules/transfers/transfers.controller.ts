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
import { TransfersService } from './transfers.service';
import {
  CreateTransferRequestDto,
  ApproveTransferDto,
  DispatchTransferDto,
  ReceiveTransferDto,
} from './dto/transfers.dto';

@Controller('api/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async requestTransfer(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateTransferRequestDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000002';
    return this.transfersService.requestTransfer(actorId, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveTransfer(
    @Param('id') transferId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: ApproveTransferDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000002';
    return this.transfersService.approveTransfer(transferId, actorId, dto);
  }

  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatchTransfer(
    @Param('id') transferId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: DispatchTransferDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000004';
    return this.transfersService.dispatchTransfer(transferId, actorId, dto);
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  async receiveTransfer(
    @Param('id') transferId: string,
    @Headers('x-user-id') userId: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    const actorId = userId || '018e0000-0000-7000-8000-000000000004';
    return this.transfersService.receiveTransfer(transferId, actorId, dto);
  }

  @Get(':id')
  async getTransfer(@Param('id') transferId: string) {
    return this.transfersService.getTransferById(transferId);
  }

  @Get()
  async listTransfers(
    @Query('branch_id') branchId?: string,
    @Query('status') status?: string,
  ) {
    return this.transfersService.listTransfers(branchId, status);
  }
}
