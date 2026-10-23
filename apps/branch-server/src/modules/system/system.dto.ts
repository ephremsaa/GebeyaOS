import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsObject,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSystemSettingDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsObject()
  @IsNotEmpty()
  value!: Record<string, any>;
}

export class AuditLogQueryDto {
  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  entityName?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  offset?: number;
}

export class CreateAuditLogDto {
  @IsString()
  @IsNotEmpty()
  action!: string;

  @IsString()
  @IsNotEmpty()
  entityName!: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}

export class RestoreBackupDto {
  @IsObject()
  @IsNotEmpty()
  backupPayload!: {
    metadata: {
      version: string;
      branchId: string;
      timestamp: string;
      sha256: string;
      recordCounts: Record<string, number>;
    };
    tables: Record<string, any[]>;
  };
}
