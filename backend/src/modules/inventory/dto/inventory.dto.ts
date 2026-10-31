import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsIn,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustmentItemDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsUUID()
  @IsOptional()
  batch_id?: string;

  @IsNumber()
  @Type(() => Number)
  quantity_change!: number; // Can be positive or negative

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  unit_cost?: number;
}

export class CreateAdjustmentDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsString()
  @IsIn(['DAMAGED_GOODS', 'EXPIRED', 'INTERNAL_USE', 'CORRECTION', 'THEFT'])
  reason_code!: 'DAMAGED_GOODS' | 'EXPIRED' | 'INTERNAL_USE' | 'CORRECTION' | 'THEFT';

  @IsString()
  @IsNotEmpty()
  notes!: string;

  @IsString()
  @IsOptional()
  approved_by?: string;

  @IsString()
  @IsOptional()
  manager_pin?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  items!: AdjustmentItemDto[];
}

export class StartStockTakeDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsString()
  @IsIn(['FULL', 'CATEGORY', 'LOCATION', 'RANDOM_SAMPLE'])
  @IsOptional()
  scope?: 'FULL' | 'CATEGORY' | 'LOCATION' | 'RANDOM_SAMPLE';

  @IsUUID()
  @IsOptional()
  category_id?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class StockTakeCountItemDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsUUID()
  @IsOptional()
  batch_id?: string;

  @IsNumber()
  @Type(() => Number)
  counted_quantity!: number;
}

export class RecordStockTakeCountsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTakeCountItemDto)
  items!: StockTakeCountItemDto[];
}

export class ReconcileStockTakeDto {
  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  manager_pin?: string;

  @IsString()
  @IsOptional()
  approved_by?: string;
}

export class InventoryQueryDto {
  @IsUUID()
  @IsNotEmpty()
  branch_id!: string;

  @IsUUID()
  @IsOptional()
  product_id?: string;

  @IsOptional()
  low_stock_only?: boolean;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  expiring_days?: number;
}
