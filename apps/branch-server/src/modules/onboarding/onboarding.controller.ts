import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import {
  CompleteTenantOnboardingDto,
  UpdateTenantBrandingDto,
} from './dto/onboarding.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller(['onboarding', 'api/onboarding'])
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('invite/:token')
  async verifyInvite(@Param('token') token: string) {
    return this.onboardingService.verifyInvite(token);
  }

  @Post('complete')
  async completeOnboarding(
    @Body() dto: CompleteTenantOnboardingDto,
    @Ip() ip: string,
  ) {
    return this.onboardingService.completeOnboarding(dto, ip);
  }

  @Get('branding')
  @UseGuards(JwtAuthGuard)
  async getBranding(@Req() req: any) {
    return this.onboardingService.getBranding(req.user.tenantId);
  }

  @Patch('branding')
  @UseGuards(JwtAuthGuard)
  async updateBranding(
    @Body() dto: UpdateTenantBrandingDto,
    @Req() req: any,
  ) {
    return this.onboardingService.updateBranding(req.user.tenantId, dto);
  }
}

