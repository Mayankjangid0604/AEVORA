import { IsString, IsNumber, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { BudgetStatus } from '@prisma/client';

export class CreateCompanyBudgetDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  period: string;

  @IsOptional()
  @IsDateString()
  fiscalPeriodStart?: string;

  @IsOptional()
  @IsDateString()
  fiscalPeriodEnd?: string;

  @IsNumber()
  totalAmount: number;
}

export class AllocateDepartmentBudgetDto {
  @IsString()
  departmentId: string;

  @IsNumber()
  allocatedAmount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdjustDepartmentAllocationDto {
  @IsNumber()
  amountDelta: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class BudgetReservationDto {
  @IsNumber()
  amount: number;

  @IsString()
  reason: string;
}

export class BudgetStatusUpdateDto {
  @IsEnum(BudgetStatus)
  status: BudgetStatus;
}
