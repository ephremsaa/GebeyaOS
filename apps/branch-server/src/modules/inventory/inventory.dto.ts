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
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  StockMovementType,
  StockReferenceType,
  StockAdjustmentReasonCode,
  StockTakeScope,
} from '@gebeyaos/shared-types';

export class CreateMovementDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsString()
  @IsNotEmpty()
  movementType!: StockMovementType;

  @IsNumber()
  quantityChange!: number;

  @IsNumber()
  @IsOptional()
  unitCost?: number;

  @IsString()
  @IsNotEmpty()
  referenceType!: StockReferenceType;

  @IsUUID()
  @IsNotEmpty()
  referenceId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateAdjustmentItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  quantityChange!: number; // Negative for loss/damage, positive for correction

  @IsNumber()
  @IsOptional()
  unitCost?: number;
}

export class CreateStockAdjustmentDto {
  @IsEnum(['DAMAGED_GOODS', 'EXPIRED', 'INTERNAL_USE', 'CORRECTION', 'THEFT'], {
    message:
      'Reason code must be one of: DAMAGED_GOODS, EXPIRED, INTERNAL_USE, CORRECTION, THEFT',
  })
  @IsNotEmpty()
  reasonCode!: StockAdjustmentReasonCode;

  @IsString()
  @IsNotEmpty()
  notes!: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAdjustmentItemDto)
  items!: CreateAdjustmentItemDto[];
}

export class CreateStockTakeDto {
  @IsEnum(['FULL', 'CATEGORY', 'RANDOM_SAMPLE'])
  @IsNotEmpty()
  scope!: StockTakeScope;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class RecordStockTakeCountItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;
}

export class RecordStockTakeCountDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecordStockTakeCountItemDto)
  items!: RecordStockTakeCountItemDto[];
}

export class ReconcileStockTakeDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateBatchDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @IsString()
  @IsOptional()
  expiryDate?: string;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsNumber()
  @Min(0)
  initialQuantity!: number;

  @IsUUID()
  @IsOptional()
  supplierId?: string;
}
