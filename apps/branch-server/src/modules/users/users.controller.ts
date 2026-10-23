import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import {
  CreateStaffUserDto,
  UpdateStaffUserDto,
  AdminResetPasswordDto,
  AdminResetPinDto,
  UpdateRolePermissionsDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller(['users', 'api/users'])
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('admin:users:manage')
  async listUsers(@Query('branchId') branchId?: string) {
    return this.usersService.listUsers(branchId);
  }

  @Post()
  @RequirePermissions('admin:users:manage')
  @HttpCode(HttpStatus.CREATED)
  async createUser(
    @CurrentUser('id') creatorId: string,
    @Body() dto: CreateStaffUserDto,
  ) {
    return this.usersService.createUser(creatorId, dto);
  }

  @Put(':id')
  @RequirePermissions('admin:users:manage')
  async updateUser(
    @CurrentUser('id') adminId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateStaffUserDto,
  ) {
    return this.usersService.updateUser(adminId, userId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('admin:users:manage')
  async setUserActiveStatus(
    @CurrentUser('id') adminId: string,
    @Param('id') userId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.usersService.setUserActiveStatus(adminId, userId, isActive);
  }

  @Post(':id/reset-password')
  @RequirePermissions('admin:users:manage')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(
    @CurrentUser('id') adminId: string,
    @Param('id') userId: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.usersService.adminResetPassword(adminId, userId, dto);
  }

  @Post(':id/reset-pin')
  @RequirePermissions('admin:users:manage')
  @HttpCode(HttpStatus.OK)
  async adminResetPin(
    @CurrentUser('id') adminId: string,
    @Param('id') userId: string,
    @Body() dto: AdminResetPinDto,
  ) {
    return this.usersService.adminResetPin(adminId, userId, dto);
  }

  @Get('roles/matrix')
  @RequirePermissions('admin:users:manage')
  async listRoles() {
    return this.usersService.listRoles();
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('admin:roles:manage')
  async updateRolePermissions(
    @CurrentUser('id') adminId: string,
    @Param('id') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.usersService.updateRolePermissions(adminId, roleId, dto);
  }

  @Get('permissions/catalog')
  @RequirePermissions('admin:users:manage')
  async listPermissions() {
    return this.usersService.listPermissions();
  }
}
