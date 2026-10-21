import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferRequestItemDto {
  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  requested_quantity!: number;
}

export class CreateTransferRequestDto {
  @IsUUID()
  @IsNotEmpty()
  source_branch_id!: string;

  @IsUUID()
  @IsNotEmpty()
  destination_branch_id!: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestItemDto)
  items!: TransferRequestItemDto[];
}

export class ApproveTransferDto {
  @IsString()
  @IsOptional()
  notes?: string;
}

export class DispatchItemInputDto {
  @IsUUID()
  @IsNotEmpty()
  transfer_item_id!: string;

  @IsUUID()
  @IsNotEmpty()
  product_id!: string;

  @IsUUID()
  @IsOptional()
  batch_id?: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  dispatched_quantity!: number;
}

export class DispatchTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchItemInputDto)
  items!: DispatchItemInputDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReceiveTransferItemDto {
  @IsUUID()
  @IsNotEmpty()
  transfer_item_id!: string;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  received_quantity!: number;

  @IsString()
  @IsOptional()
  discrepancy_reason?: string;
}

export class ReceiveTransferDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferItemDto)
  items!: ReceiveTransferItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
