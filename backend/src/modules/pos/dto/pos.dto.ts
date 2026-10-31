import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsIn,
  IsArray,
  IsBoolean,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OpenShiftDto {
  @IsUUID()
  @IsNotEmpty()
  terminal_id!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  opening_cash_float!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  closing_cash_counted!: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  authorized_by?: string;

  @IsString()
  @IsOptional()
  manager_pin?: string;
}

export class CashMovementDto {
  @IsString()
  @IsIn(['FLOAT_IN', 'PETTY_CASH_OUT', 'SAFE_DROP', 'ADDITIONAL_FLOAT'])
  movement_type!: 'FLOAT_IN' | 'PETTY_CASH_OUT' | 'SAFE_DROP' | 'ADDITIONAL_FLOAT';

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsUUID()
  @IsOptional()
  authorized_by?: string;
}

export class SaleItemInputDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unit_price!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  discount_amount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  discount_percentage?: number;

  @IsString()
  @IsOptional()
  discount_reason?: string;
}

export class SalePaymentInputDto {
  @IsString()
  @IsIn(['CASH', 'TELEBIRR', 'CBE_BIRR', 'CARD_POS', 'BANK_TRANSFER'])
  payment_method!: 'CASH' | 'TELEBIRR' | 'CBE_BIRR' | 'CARD_POS' | 'BANK_TRANSFER';

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @IsString()
  @IsOptional()
  provider_reference?: string;

  @IsBoolean()
  @IsOptional()
  is_offline_verified?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateSaleDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsUUID()
  @IsNotEmpty()
  terminal_id!: string;

  @IsUUID()
  @IsNotEmpty()
  shift_id!: string;

  @IsString()
  @IsOptional()
  idempotency_key?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items!: SaleItemInputDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentInputDto)
  payments!: SalePaymentInputDto[];

  @IsString()
  @IsOptional()
  client_timestamp?: string;
}

export class RefundItemInputDto {
  @IsUUID()
  @IsNotEmpty()
  original_sale_item_id!: string;

  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsUUID()
  @IsOptional()
  batch_id?: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  refund_unit_price!: number;

  @IsBoolean()
  @IsOptional()
  return_to_inventory?: boolean;
}

export class CreateRefundDto {
  @IsUUID()
  @IsNotEmpty()
  original_sale_id!: string;

  @IsUUID()
  @IsNotEmpty()
  authorized_by!: string; // Manager authorization required

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundItemInputDto)
  items!: RefundItemInputDto[];
}

export class HoldCartDto {
  @IsUUID()
  @IsOptional()
  branch_id?: string;

  @IsUUID()
  @IsNotEmpty()
  terminal_id!: string;

  @IsString()
  @IsOptional()
  customer_identifier?: string;

  @IsArray()
  items!: any[];

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  subtotal?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  tax_total?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  grand_total?: number;
}

export class ReprintReceiptDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
