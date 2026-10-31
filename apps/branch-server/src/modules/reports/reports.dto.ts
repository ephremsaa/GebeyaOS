import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DateRangeQueryDto {
  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  period?: 'today' | 'yesterday' | 'week' | 'month' | 'custom';

  @IsString()
  @IsOptional()
  branchId?: string;
}

export class ExpiringStockQueryDto {
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  days?: number = 30;

  @IsString()
  @IsOptional()
  branchId?: string;
}
