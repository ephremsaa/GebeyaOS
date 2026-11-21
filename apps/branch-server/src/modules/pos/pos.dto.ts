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
  @IsOptional()
  terminalId?: string;

  @IsUUID()
  @IsOptional()
  terminal_id?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  openingCashFloat?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  opening_cash_float?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  getResolvedTerminalId(): string {
    return this.terminalId || this.terminal_id || '';
  }

  getResolvedOpeningCashFloat(): number {
    return this.openingCashFloat ?? this.opening_cash_float ?? 0;
  }
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
  @IsOptional()
  closingCashCounted?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  closing_cash_counted?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  getResolvedClosingCash(): number {
    return this.closingCashCounted ?? this.closing_cash_counted ?? 0;
  }
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

  @IsBoolean()
  @IsOptional()
  isVat?: boolean;

  @IsBoolean()
  @IsOptional()
  isVatApplicable?: boolean;

  @IsNumber()
  @IsOptional()
  vatRate?: number;

  @IsNumber()
  @IsOptional()
  vatAmount?: number;

  @IsNumber()
  @IsOptional()
  lineTotal?: number;

  @IsNumber()
  @IsOptional()
  scaleWeightGrams?: number;
}

export class SalePaymentDto {
  @IsEnum(['CASH', 'TELEBIRR', 'CBE_BIRR', 'CARD_POS', 'BANK_TRANSFER'])
  @IsOptional()
  paymentMethod?: PaymentMethod;

  @IsEnum(['CASH', 'TELEBIRR', 'CBE_BIRR', 'CARD_POS', 'BANK_TRANSFER'])
  @IsOptional()
  method?: PaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsNumber()
  @IsOptional()
  tendered?: number;

  @IsNumber()
  @IsOptional()
  change?: number;

  @IsString()
  @IsOptional()
  providerReference?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsBoolean()
  @IsOptional()
  isOfflineVerified?: boolean;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateSaleDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsUUID()
  @IsOptional()
  terminalId?: string;

  @IsUUID()
  @IsNotEmpty()
  shiftId!: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  clientTimestamp?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SaleLineItemDto)
  items?: SaleLineItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SaleLineItemDto)
  lines?: SaleLineItemDto[];

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];

  @IsNumber()
  @IsOptional()
  subtotal?: number;

  @IsNumber()
  @IsOptional()
  taxTotal?: number;

  @IsNumber()
  @IsOptional()
  discountTotal?: number;

  @IsNumber()
  @IsOptional()
  grandTotal?: number;

  @IsString()
  @IsOptional()
  customerTIN?: string;

  @IsString()
  @IsOptional()
  offlineReceiptNumber?: string;

  @IsBoolean()
  @IsOptional()
  bypassFiscal?: boolean;

  @IsBoolean()
  @IsOptional()
  managerOverrideExpired?: boolean;

  @IsString()
  @IsOptional()
  overrideReason?: string;
}

export class HeldBasketLineItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  discount!: number;

  @IsNumber()
  @Min(0)
  lineTotal!: number;

  @IsBoolean()
  isVat!: boolean;

  @IsNumber()
  @IsOptional()
  scaleWeightGrams?: number;
}

export class HoldBasketDto {
  @IsUUID()
  @IsNotEmpty()
  terminalId!: string;

  @IsString()
  @IsOptional()
  customerIdentifier?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => HeldBasketLineItemDto)
  items!: HeldBasketLineItemDto[];

  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsNumber()
  @Min(0)
  taxTotal!: number;

  @IsNumber()
  @Min(0)
  grandTotal!: number;
}

export class ManagerPinVerifyDto {
  @IsString()
  @IsNotEmpty()
  pin!: string;

  @IsString()
  @IsOptional()
  actionRequired?: string;
}

export class ReprintReceiptDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
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
