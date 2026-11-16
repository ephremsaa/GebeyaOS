import { Controller, Get, Query } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller(['public', 'api/public'])
export class PublicController {
  constructor(private readonly authService: AuthService) {}

  @Get('branding')
  async getBranding(@Query('code') code?: string) {
    return this.authService.getPublicBranding(code);
  }
}
