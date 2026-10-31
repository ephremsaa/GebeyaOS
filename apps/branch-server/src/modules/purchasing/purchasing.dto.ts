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
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '@gebeyaos/shared-types';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  tinNumber?: string;

  @IsString()
  @IsOptional()
  vatNumber?: string;

  @IsString()
  @IsOptional()
  contactPerson?: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  paymentTermsDays?: number;
}

export class PurchaseOrderItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @Min(0.001)
  orderedQuantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  taxRate?: number;
}

export class CreatePurchaseOrderDto {
  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsOptional()
  expectedDeliveryDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items!: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderStatusDto {
  @IsEnum(['DRAFT', 'ISSUED', 'CANCELLED'], {
    message: 'Manual status update only allowed for DRAFT, ISSUED, or CANCELLED',
  })
  @IsNotEmpty()
  status!: PurchaseOrderStatus;
}

export class GRNItemDto {
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
  @Min(0.001)
  receivedQuantity!: number;

  @IsNumber()
  @Min(0)
  purchaseUnitCost!: number;
}

export class CreateGRNDto {
  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @IsUUID()
  @IsOptional()
  purchaseOrderId?: string;

  @IsString()
  @IsOptional()
  supplierInvoiceNo?: string;

  @IsString()
  @IsOptional()
  supplierInvoiceDate?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  landedFreightCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  landedOtherCost?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  landedDutyCost?: number;

  @IsString()
  @IsOptional()
  allocationMethod?: 'BY_VALUE' | 'BY_QUANTITY';

  @IsOptional()
  applyWithholdingTax?: boolean;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GRNItemDto)
  items!: GRNItemDto[];
}

export class ApprovePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  managerPin!: string;
}

export class RecordSupplierPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @IsUUID()
  @IsOptional()
  payableId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsNotEmpty()
  paymentMethod!: string;

  @IsString()
  @IsOptional()
  referenceNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReturnItemInputDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @IsUUID()
  @IsOptional()
  batchId?: string;

  @IsString()
  @IsOptional()
  batchNumber?: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateSupplierReturnDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @IsUUID()
  @IsOptional()
  grnId?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ValidateNested({ each: true })
  @Type(() => ReturnItemInputDto)
  items!: ReturnItemInputDto[];
}

