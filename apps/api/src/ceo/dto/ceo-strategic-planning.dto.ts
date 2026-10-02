import { IsString, IsNotEmpty, IsDateString, IsEnum, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ObjectivePriority, RiskLevel } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsDateString()
  planningPeriodStart: Date;

  @IsDateString()
  planningPeriodEnd: Date;
}

export class CreateObjectiveDto {
  @IsString()
  @IsNotEmpty()
  strategicPlanId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(ObjectivePriority)
  priority: ObjectivePriority;

  @IsDateString()
  targetDate: Date;

  @IsString()
  @IsNotEmpty()
  ownerId: string;
}

export class CreateStrategicRiskDto {
  @IsString()
  @IsNotEmpty()
  objectiveId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(RiskLevel)
  probability: RiskLevel;

  @IsEnum(RiskLevel)
  impact: RiskLevel;

  @IsString()
  @IsNotEmpty()
  mitigation: string;

  @IsString()
  @IsNotEmpty()
  ownerId: string;
}

export class UpdateObjectiveProgressDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;
}
