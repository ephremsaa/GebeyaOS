import { IsString, IsNotEmpty, IsEmail, IsOptional, IsIn, IsInt, Min, Max, MinLength } from 'class-validator';
import { TenantPlan, TenantStatus } from '@gebeyaos/shared-types';

export class PlatformLoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;
}

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsIn(['starter', 'growth', 'enterprise'])
  plan!: TenantPlan;

  @IsString()
  @IsNotEmpty()
  ownerName!: string;

  @IsString()
  @IsNotEmpty()
  ownerEmailOrPhone!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxBranches?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxTerminals?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxUsers?: number;
}

export class UpdateTenantStatusDto {
  @IsString()
  @IsIn(['trial', 'active', 'suspended'])
  status!: TenantStatus;
}

export class SupportAccessRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  reason!: string;

  @IsInt()
  @Min(1)
  @Max(72)
  @IsOptional()
  durationHours?: number;
}

export class ResetOwnerDto {
  @IsString()
  @IsOptional()
  temporaryPassword?: string;
}

export class DeleteTenantDto {
  @IsString()
  @IsNotEmpty()
  confirmationCode!: string;
}

export class Platform2FAVerifyDto {
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  rememberDevice?: boolean;
}

export class PlatformRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class PlatformChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  newPassword!: string;
}

export class PlatformReauthDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  totpCode!: string;
}

export class PlatformUpdatePlanDto {
  @IsString()
  @IsIn(['starter', 'growth', 'enterprise'])
  plan!: TenantPlan;
}

export class SubmitTenantApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  supermarketName!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  ownerFullName!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RejectApplicationDto {
  @IsString()
  @IsOptional()
  reason?: string;
}

