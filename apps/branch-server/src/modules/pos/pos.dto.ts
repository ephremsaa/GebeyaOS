import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CashMovementType,
  PaymentMethod,
} from '@gebeyaos/shared-types';

export class OpenShiftDto {
  @IsUUID()
  @IsNotEmpty()
  terminalId!: string;

  @IsNumber()
  @Min(0)
  openingCashFloat!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordCashMovementDto {
  @IsEnum(['FLOAT_IN', 'PETTY_CASH_OUT', 'SAFE_DROP', 'ADDITIONAL_FLOAT'])
  @IsNotEmpty()
  movementType!: CashMovementType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsUUID()
  @IsOptional()
  authorizedBy?: string;
}

export class CloseShiftDto {
  @IsNumber()
  @Min(0)
  closingCashCounted!: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SaleLineItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unitPrice?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  discountAmount?: number;

  @IsString()
  @IsOptional()
  discountReason?: string;
}

export class SalePaymentDto {
  @IsEnum(['CASH', 'TELEBIRR', 'CBE_BIRR', 'CARD_POS', 'BANK_TRANSFER'])
  @IsNotEmpty()
  paymentMethod!: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  providerReference?: string;

  @IsBoolean()
  @IsOptional()
  isOfflineVerified?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateSaleDto {
  @IsUUID()
  @IsNotEmpty()
  terminalId!: string;

  @IsUUID()
  @IsNotEmpty()
  shiftId!: string;

  @IsString()
  @IsOptional()
  clientTimestamp?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineItemDto)
  items!: SaleLineItemDto[];

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];

  @IsBoolean()
  @IsOptional()
  bypassFiscal?: boolean;
}

export class RefundLineItemDto {
  @IsUUID()
  @IsNotEmpty()
  originalSaleItemId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsBoolean()
  @IsOptional()
  returnToInventory?: boolean;
}

export class CreateSaleRefundDto {
  @IsUUID()
  @IsNotEmpty()
  originalSaleId!: string;

  @IsUUID()
  @IsNotEmpty()
  authorizedBy!: string;

  @IsUUID()
  @IsNotEmpty()
  shiftId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundLineItemDto)
  items!: RefundLineItemDto[];
}
