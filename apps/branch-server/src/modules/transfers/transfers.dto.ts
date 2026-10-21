import {
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

export class CreateTransferItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @Min(0.001)
  requestedQuantity!: number;
}

export class CreateTransferDto {
  @IsUUID()
  @IsNotEmpty()
  destinationBranchId!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransferItemDto)
  items!: CreateTransferItemDto[];
}

export class DispatchTransferItemDto {
  @IsUUID()
  @IsNotEmpty()
  transferItemId!: string;

  @IsNumber()
  @Min(0)
  dispatchedQuantity!: number;

  @IsUUID()
  @IsOptional()
  batchId?: string;
}

export class DispatchTransferDto {
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DispatchTransferItemDto)
  items?: DispatchTransferItemDto[];
}

export class ReceiveTransferItemDto {
  @IsUUID()
  @IsNotEmpty()
  transferItemId!: string;

  @IsNumber()
  @Min(0)
  receivedQuantity!: number;

  @IsString()
  @IsOptional()
  discrepancyReason?: string;
}

export class ReceiveTransferDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items!: ReceiveTransferItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
