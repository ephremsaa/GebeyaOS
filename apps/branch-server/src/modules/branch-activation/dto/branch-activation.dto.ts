import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';

export class GenerateActivationCodeDto {
  @IsString()
  @IsNotEmpty()
  branchName!: string;

  @IsInt()
  @Min(1)
  @Max(168) // up to 7 days
  @IsOptional()
  expiresInHours?: number;
}

export class ActivateBranchDto {
  @IsString()
  @IsNotEmpty()
  activationCode!: string;

  @IsString()
  @IsOptional()
  branchCode?: string;

  @IsString()
  @IsOptional()
  serverIp?: string;
}

