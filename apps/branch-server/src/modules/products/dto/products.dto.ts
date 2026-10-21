import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsString()
  @IsNotEmpty()
  name_en!: string;

  @IsString()
  @IsOptional()
  name_am?: string;

  @IsUUID()
  @IsNotEmpty()
  category_id!: string;

  @IsString()
  @IsNotEmpty()
  uom_code!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  base_price!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  cost_price?: number;

  @IsBoolean()
  @IsOptional()
  is_vat_applicable?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @Type(() => Number)
  vat_rate?: number;

  @IsBoolean()
  @IsOptional()
  is_weighed?: boolean;

  @IsString()
  @IsOptional()
  scale_plu?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  min_stock_level?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  max_stock_level?: number;

  @IsBoolean()
  @IsOptional()
  allow_discount?: boolean;
}

export class CreateBarcodeDto {
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @IsString()
  @IsIn(['EAN13', 'UPCA', 'CODE128', 'CUSTOM'])
  @IsOptional()
  barcode_type?: 'EAN13' | 'UPCA' | 'CODE128' | 'CUSTOM';

  @IsNumber()
  @Min(0.001)
  @IsOptional()
  @Type(() => Number)
  pack_multiplier?: number;

  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}

export class SetBranchOverrideDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  selling_price?: number;

  @IsBoolean()
  @IsOptional()
  is_vat_applicable?: boolean;

  @IsNumber()
  @Min(0)
  @Max(1)
  @IsOptional()
  @Type(() => Number)
  vat_rate?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  min_stock_level?: number;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class PriceChangeDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  new_price!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsUUID()
  @IsOptional()
  changed_by?: string;

  @IsUUID()
  @IsOptional()
  branch_id?: string;
}
