import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsBoolean, IsDateString } from 'class-validator';
import { CeoFinancialOperation } from '@prisma/client';

export class GrantAuthorityDto {
  @IsString()
  ceoEmployeeId: string;

  @IsNumber()
  singleTransactionLimit: number;

  @IsNumber()
  dailyLimit: number;

  @IsNumber()
  monthlyLimit: number;

  @IsBoolean()
  @IsOptional()
  budgetLimit?: boolean;

  @IsArray()
  @IsEnum(CeoFinancialOperation, { each: true })
  allowedOperations: CeoFinancialOperation[];

  @IsNumber()
  @IsOptional()
  requiresChairmanApprovalAbove?: number;

  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @IsDateString()
  @IsOptional()
  effectiveUntil?: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CheckAuthorityDto {
  @IsEnum(CeoFinancialOperation)
  operation: CeoFinancialOperation;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  budgetId?: string;
}
