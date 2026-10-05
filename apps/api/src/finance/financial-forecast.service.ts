import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { ForecastType } from '@prisma/client';

@Injectable()
export class FinancialForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createForecast(companyId: string, actorId: string, dto: {
    forecastType: ForecastType; period: string; amount: number; currency?: string;
    assumptions?: unknown[]; dataSource: string; confidence?: number; notes?: string;
    // isAdvisory is always true — callers cannot set false
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.amount)) throw new BadRequestException('amount must be an integer');

    const forecast = await this.prisma.financialForecast.create({
      data: {
        companyId,
        forecastType: dto.forecastType,
        period: dto.period,
        amount: dto.amount,
        currency: dto.currency ?? 'INR',
        assumptions: (dto.assumptions ?? []) as any,
        dataSource: dto.dataSource,
        generatedById: actorId,
        isAdvisory: true, // IMMUTABLE — forecasts are always advisory
        confidence: dto.confidence,
        notes: dto.notes,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'FORECAST_CREATED',
      objectType: 'FinancialForecast', objectId: forecast.id,
      newValue: { forecastType: dto.forecastType, period: dto.period, amount: dto.amount, isAdvisory: true },
    });
    return forecast;
  }

  async getForecasts(companyId: string, forecastType?: ForecastType, period?: string) {
    const where: Record<string, unknown> = { companyId };
    if (forecastType) where['forecastType'] = forecastType;
    if (period) where['period'] = period;
    return this.prisma.financialForecast.findMany({
      where: where as any,
      orderBy: { generatedAt: 'desc' },
    });
  }

  async getForecast(companyId: string, forecastId: string) {
    const f = await this.prisma.financialForecast.findUnique({ where: { id: forecastId } });
    if (!f || f.companyId !== companyId) throw new NotFoundException('Forecast not found');
    return f;
  }
}
