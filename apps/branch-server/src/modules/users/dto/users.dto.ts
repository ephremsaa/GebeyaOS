import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsIn,
} from 'class-validator';
import { RoleName } from '@gebeyaos/shared-types';

export class CreateStaffUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  initialPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin!: string;

  @IsString()
  @IsNotEmpty()
  role!: RoleName;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsBoolean()
  @IsOptional()
  forcePasswordChange?: boolean = true;
}

export class UpdateStaffUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  role?: RoleName;

  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @IsOptional()
  maxDiscountPercentage?: number;
}

export class AdminResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @IsBoolean()
  @IsOptional()
  forcePasswordChange?: boolean = true;
}

export class AdminResetPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  newPin!: string;
}

export class UpdateRolePermissionsDto {
  @IsString({ each: true })
  permissionIds!: string[];

  @IsOptional()
  maxDiscountPercentage?: number;
}
