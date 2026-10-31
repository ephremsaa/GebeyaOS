import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
  IsObject,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class VatSettingsDto {
  @IsNumber()
  rate!: number;

  @IsBoolean()
  inclusive!: boolean;

  @IsString()
  @IsOptional()
  vatNumber?: string;
}

export class CompleteTenantOnboardingDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  tradeName?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(16)
  tinNumber!: string;

  @IsObject()
  vatSettings!: VatSettingsDto;

  @IsString()
  @IsIn(['am', 'en'])
  defaultLanguage!: 'am' | 'en';

  @IsString()
  @IsNotEmpty()
  receiptHeader!: string;

  @IsString()
  @IsNotEmpty()
  receiptFooter!: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsNotEmpty()
  branchCode!: string;

  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @IsString()
  @IsOptional()
  branchCity?: string;

  @IsString()
  @IsNotEmpty()
  branchPhone!: string;

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
  @IsNotEmpty()
  @MinLength(8)
  ownerPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(6)
  ownerPin!: string;
}

export class UpdateTenantBrandingDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  receiptHeader?: string;

  @IsString()
  @IsOptional()
  receiptFooter?: string;

  @IsString()
  @IsOptional()
  @IsIn(['am', 'en'])
  defaultLanguage?: 'am' | 'en';

  @IsObject()
  @IsOptional()
  vatSettings?: VatSettingsDto;
}

