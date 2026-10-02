import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategyForecastType, StrategicHorizon } from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';

@Injectable()
export class StrategicForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createForecast(companyId: string, actorId: string, dto: {
    forecastType: StrategyForecastType;
    initiativeId?: string;
    horizon?: StrategicHorizon;
    value: number;
    valueLow?: number;
    valueHigh?: number;
    confidence?: number;
    assumptions?: unknown[];
    methodology?: string;
    sourceData?: unknown;
  }) {
    await this.verifyActor(actorId, companyId);

    if (!Number.isInteger(dto.value)) throw new BadRequestException('value must be integer');
    if (dto.valueLow !== undefined && !Number.isInteger(dto.valueLow)) throw new BadRequestException('valueLow must be integer');
    if (dto.valueHigh !== undefined && !Number.isInteger(dto.valueHigh)) throw new BadRequestException('valueHigh must be integer');
    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100)) throw new BadRequestException('confidence must be 0-100');

    if (dto.initiativeId) {
      const init = await this.prisma.strategicInitiative.findUnique({ where: { id: dto.initiativeId } });
      if (!init || init.companyId !== companyId) throw new NotFoundException('Initiative not found');
    }

    // Auto-increment version for this company+forecastType
    const latest = await this.prisma.strategicForecast.findFirst({
      where: { companyId, forecastType: dto.forecastType },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;

    let forecast: Awaited<ReturnType<typeof this.prisma.strategicForecast.create>>;
    try {
      forecast = await this.prisma.strategicForecast.create({
        data: {
          companyId,
          initiativeId: dto.initiativeId,
          forecastType: dto.forecastType,
          horizon: dto.horizon ?? StrategicHorizon.MEDIUM_TERM,
          version,
          value: dto.value,
          valueLow: dto.valueLow ?? dto.value,
          valueHigh: dto.valueHigh ?? dto.value,
          confidence: dto.confidence ?? 50,
          assumptions: (dto.assumptions ?? []) as any,
          methodology: dto.methodology,
          sourceData: (dto.sourceData ?? {}) as any,
          generatedBy: actorId,
          isAdvisory: true, // forecasts are ALWAYS advisory — never authoritative ledger entries
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Concurrent forecast version conflict — retry');
      throw e;
    }

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_FORECAST_CREATED', objectType: 'StrategicForecast', objectId: forecast.id, newValue: { forecastType: forecast.forecastType, version: forecast.version, value: forecast.value } });
    return forecast;
  }

  async recordActual(companyId: string, actorId: string, forecastId: string, actualValue: number, outcomeNote: string) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(actualValue)) throw new BadRequestException('actualValue must be integer');

    const forecast = await this.prisma.strategicForecast.findUnique({ where: { id: forecastId } });
    if (!forecast || forecast.companyId !== companyId) throw new NotFoundException('Forecast not found');
    if (forecast.actualValue !== null) throw new BadRequestException('Actual value already recorded (append-only)');

    // actualValue recorded on forecast for learning — does NOT write to financial ledger
    // Atomic conditional update: where actualValue IS NULL prevents double-write under concurrency
    const { count } = await this.prisma.strategicForecast.updateMany({
      where: { id: forecastId, companyId, actualValue: null },
      data: { actualValue, outcomeNote },
    });
    if (count === 0) throw new BadRequestException('Actual value already recorded (append-only)');
    const updated = await this.prisma.strategicForecast.findUnique({ where: { id: forecastId } });
    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_FORECAST_ACTUAL_RECORDED', objectType: 'StrategicForecast', objectId: forecastId, newValue: { actualValue, outcomeNote } });
    return updated;
  }

  async getForecasts(companyId: string, forecastType?: StrategyForecastType) {
    return this.prisma.strategicForecast.findMany({
      where: { companyId, ...(forecastType ? { forecastType } : {}) },
      orderBy: [{ forecastType: 'asc' }, { version: 'desc' }],
    });
  }

  async getForecastHistory(companyId: string, forecastType: StrategyForecastType) {
    return this.prisma.strategicForecast.findMany({
      where: { companyId, forecastType },
      orderBy: { version: 'asc' },
    });
  }
}
