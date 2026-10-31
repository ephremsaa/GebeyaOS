import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Ip,
  Headers,
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
  ForgotPasswordDto,
  ResetPasswordDto,
  UpdateProfileDto,
  TerminalPairDto,
  ManagerOverrideDto,
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
  async executeSetup(
    @Body() dto: SetupWizardDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.executeSetup(dto, ip, userAgent);
  }

  @Get('company-info')
  async getCompanyInfoDefault(@Query('slug') slug?: string) {
    return this.authService.getCompanyInfo(slug);
  }

  @Get('company-info/:slug')
  async getCompanyInfoBySlug(@Param('slug') slug: string) {
    return this.authService.getCompanyInfo(slug);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  async pinLogin(@Body() dto: PinLoginDto, @Ip() ip: string) {
    return this.authService.pinLogin(dto, ip);
  }

  @Get('cashiers')
  async getCashiers(
    @Query('branchId') branchId?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.authService.getCashiers(branchId, tenantId);
  }

  @Post('terminals/pair')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async pairTerminal(
    @CurrentUser('id') managerUserId: string,
    @Body() dto: TerminalPairDto,
    @Ip() ip: string,
  ) {
    return this.authService.pairTerminal(dto, managerUserId, ip);
  }

  @Post('manager-override')
  @HttpCode(HttpStatus.OK)
  async managerOverride(
    @Body() dto: ManagerOverrideDto,
    @Ip() ip: string,
  ) {
    return this.authService.managerOverride(dto, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.refreshSession(dto.refreshToken, ip, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Body() dto: { refreshToken?: string },
  ) {
    await this.authService.logout(userId, dto?.refreshToken);
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(@CurrentUser('id') userId: string) {
    await this.authService.logoutAll(userId);
    return { success: true, message: 'All active sessions have been revoked' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.forgotPassword(dto, ip, userAgent);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.resetPassword(dto, ip, userAgent);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getUserProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserProfile(user.id, user.tenantId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  async updateUserProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateUserProfile(user.id, dto, user.tenantId);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getUserSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getUserSessions(user.id, user.tenantId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeSession(user.id, sessionId, user.tenantId);
    return { success: true, message: 'Session revoked successfully' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.authService.changePassword(userId, dto, ip, userAgent);
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
