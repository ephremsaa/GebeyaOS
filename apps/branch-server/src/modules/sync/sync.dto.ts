import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class TriggerSyncDto {
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;

  @IsBoolean()
  @IsOptional()
  force?: boolean = false;
}
