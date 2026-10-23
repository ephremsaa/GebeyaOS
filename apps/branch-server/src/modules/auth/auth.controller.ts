import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Ip,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  SetupWizardDto,
  LoginDto,
  PinLoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  ChangePinDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@gebeyaos/shared-types';

@Controller(['auth', 'api/auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('setup-status')
  async getSetupStatus() {
    return this.authService.getSetupStatus();
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  async executeSetup(@Body() dto: SetupWizardDto, @Ip() ip: string) {
    return this.authService.executeSetup(dto, ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  async pinLogin(@Body() dto: PinLoginDto, @Ip() ip: string) {
    return this.authService.pinLogin(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshSession(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() dto: { refreshToken?: string },
  ) {
    await this.authService.logout(userId, dto.refreshToken);
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto);
    return { success: true, message: 'Password updated successfully' };
  }

  @Post('change-pin')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePin(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePinDto,
  ) {
    await this.authService.changePin(userId, dto);
    return { success: true, message: 'Cashier PIN updated successfully' };
  }
}
