import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsArray,
  IsBoolean,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  tin_number?: string;

  @IsString()
  @IsOptional()
  vat_number?: string;

  @IsString()
  @IsOptional()
  contact_person?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  payment_terms_days?: number;
}

export class PurchaseOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  ordered_quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unit_cost!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  tax_rate?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsUUID()
  @IsNotEmpty()
  supplier_id!: string;

  @IsString()
  @IsOptional()
  expected_delivery_date?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class GrnItemInputDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsString()
  @IsNotEmpty()
  batch_number!: string;

  @IsString()
  @IsOptional()
  expiry_date?: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  received_quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  purchase_unit_cost!: number;
}

export class CreateGrnDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsUUID()
  @IsOptional()
  purchase_order_id?: string;

  @IsUUID()
  @IsNotEmpty()
  supplier_id!: string;

  @IsString()
  @IsOptional()
  supplier_invoice_no?: string;

  @IsString()
  @IsOptional()
  supplier_invoice_date?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  landed_freight_cost?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  landed_other_cost?: number;

  @IsBoolean()
  @IsOptional()
  apply_withholding_tax?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnItemInputDto)
  items!: GrnItemInputDto[];
}
