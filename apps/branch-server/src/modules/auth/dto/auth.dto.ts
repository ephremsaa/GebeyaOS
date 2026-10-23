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
  @IsNotEmpty()
  usernameOrPhone!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class PinLoginDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin!: string;

  @IsString()
  @IsOptional()
  terminalCode?: string;
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
