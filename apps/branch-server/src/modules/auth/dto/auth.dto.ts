import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
} from 'class-validator';

export class SetupWizardDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @IsNotEmpty()
  branchCode!: string;

  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @IsString()
  @IsNotEmpty()
  tinNumber!: string;

  @IsString()
  @IsOptional()
  currency: string = 'ETB';

  @IsNumber()
  @IsOptional()
  defaultVatRate: number = 0.15;

  @IsString()
  @IsIn(['en', 'am'])
  @IsOptional()
  language: 'en' | 'am' = 'en';

  @IsString()
  @IsOptional()
  receiptHeader?: string;

  @IsString()
  @IsOptional()
  receiptFooter?: string;

  @IsString()
  @IsNotEmpty()
  ownerUsername!: string;

  @IsString()
  @IsNotEmpty()
  ownerFullName!: string;

  @IsString()
  @IsNotEmpty()
  ownerPhone!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(6)
  ownerPin!: string;
}

export class LoginDto {
  @IsString()
  @IsOptional()
  companyCode?: string;

  @IsString()
  @IsNotEmpty()
  usernameOrPhone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsOptional()
  totpCode?: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  companyCode!: string;

  @IsString()
  @IsNotEmpty()
  usernameOrPhone!: string;

  @IsString()
  @IsIn(['EMAIL', 'SMS'])
  @IsOptional()
  channel: 'EMAIL' | 'SMS' = 'SMS';
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  companyCode!: string;

  @IsString()
  @IsNotEmpty()
  usernameOrPhone!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(8)
  code!: string;

  @IsString()
  @MinLength(10)
  newPassword!: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  defaultBranchId?: string;
}

export class PinLoginDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin!: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  terminalCode?: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;
}

export class TerminalPairDto {
  @IsString()
  @IsNotEmpty()
  terminalCode!: string;

  @IsString()
  @IsNotEmpty()
  terminalName!: string;

  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;

  @IsNumber()
  @IsOptional()
  autoLockMinutes?: number;
}

export class ManagerOverrideDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  managerPin!: string;

  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsString()
  @IsOptional()
  requiredPermission?: string;

  @IsNumber()
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsString()
  @IsOptional()
  cashierId?: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePinDto {
  @IsString()
  @IsOptional()
  currentPin?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(6)
  newPin!: string;
}
