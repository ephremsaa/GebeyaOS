import { IsString, IsOptional, IsUUID, IsIn } from 'class-validator';

export class ReportFilterDto {
  @IsUUID()
  @IsOptional()
  branch_id?: string;

  @IsString()
  @IsOptional()
  start_date?: string; // YYYY-MM-DD

  @IsString()
  @IsOptional()
  end_date?: string; // YYYY-MM-DD

  @IsString()
  @IsIn(['json', 'csv'])
  @IsOptional()
  format?: 'json' | 'csv';
}
