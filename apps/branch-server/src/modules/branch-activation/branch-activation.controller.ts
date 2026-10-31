import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { BranchActivationService } from './branch-activation.service';
import {
  GenerateActivationCodeDto,
  ActivateBranchDto,
} from './dto/branch-activation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller(['branches/activation', 'api/branches/activation'])
export class BranchActivationController {
  constructor(private readonly activationService: BranchActivationService) {}

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  async generateCode(
    @Body() dto: GenerateActivationCodeDto,
    @Req() req: any,
  ) {
    return this.activationService.generateCode(
      dto,
      req.user.id,
      req.user.tenantId,
    );
  }

  @Get('list')
  @UseGuards(JwtAuthGuard)
  async listCodes(@Req() req: any) {
    return this.activationService.listCodes(req.user.tenantId);
  }

  @Post('activate')
  async activateBranch(
    @Body() dto: ActivateBranchDto,
    @Ip() ip: string,
  ) {
    return this.activationService.activateBranch({
      ...dto,
      serverIp: dto.serverIp || ip,
    });
  }
}

