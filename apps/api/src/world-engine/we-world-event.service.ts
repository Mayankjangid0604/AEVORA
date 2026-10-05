import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeEventCategory, WeEventSeverity, WeEventSource, WeIndicatorType, WeWorldEvent } from '@prisma/client';
import { WeInterpretationService } from './we-interpretation.service';
import { WeMarketStateService } from './we-market-state.service';
import { WeSimulationBridgeService } from './we-simulation-bridge.service';

export interface IngestWorldEventDto {
  category: WeEventCategory;
  severity: WeEventSeverity;
  source?: WeEventSource;
  title: string;
  description: string;
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt?: Date;
  indicators?: Array<{
    indicatorType: WeIndicatorType;
    value: number;
    unit: string;
    previousValue?: number;
    deltaPercent?: number;
    notes?: string;
  }>;
}

@Injectable()
export class WeWorldEventService {
  private readonly logger = new Logger(WeWorldEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly interpretation: WeInterpretationService,
    private readonly marketState: WeMarketStateService,
    private readonly bridge: WeSimulationBridgeService,
  ) {}

  private get killSwitch(): boolean {
    return process.env.WE_WORLD_ENGINE === 'false';
  }

  async ingest(companyId: string, dto: IngestWorldEventDto): Promise<WeWorldEvent> {
    if (this.killSwitch) throw new ServiceUnavailableException('World Engine kill switch active');

    try {
      const event = await this.prisma.weWorldEvent.create({
        data: {
          companyId,
          category: dto.category,
          severity: dto.severity,
          source: dto.source ?? 'MOCK',
          title: dto.title,
          description: dto.description,
          rawData: JSON.parse(JSON.stringify(dto.rawData)),
          normalizedData: JSON.parse(JSON.stringify(dto.normalizedData)),
          idempotencyKey: dto.idempotencyKey,
          occurredAt: dto.occurredAt ?? new Date(),
          indicators: dto.indicators?.length
            ? {
                create: dto.indicators.map((ind) => ({
                  companyId,
                  indicatorType: ind.indicatorType,
                  value: ind.value,
                  unit: ind.unit,
                  previousValue: ind.previousValue,
                  deltaPercent: ind.deltaPercent,
                  notes: ind.notes,
                  recordedAt: dto.occurredAt ?? new Date(),
                  source: dto.source ?? 'MOCK',
                })),
              }
            : undefined,
        },
        include: { indicators: true },
      });
      return event;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Idempotency: return existing
        return this.prisma.weWorldEvent.findUniqueOrThrow({
          where: { companyId_idempotencyKey: { companyId, idempotencyKey: dto.idempotencyKey } },
        });
      }
      throw err;
    }
  }

  async interpret(worldEventId: string): Promise<void> {
    if (this.killSwitch) throw new ServiceUnavailableException('World Engine kill switch active');

    const event = await this.prisma.weWorldEvent.findUniqueOrThrow({
      where: { id: worldEventId },
      include: { indicators: true },
    });

    const result = this.interpretation.interpret(
      event.category,
      event.severity,
      event.normalizedData as Record<string, unknown>,
      event.indicators.map((i) => ({
        indicatorType: i.indicatorType,
        value: i.value,
        previousValue: i.previousValue,
      })),
    );

    const updatedState = await this.marketState.applyDelta(event.companyId, result.delta, event.id);

    const snapshot = {
      energyCostIndex: updatedState.energyCostIndex,
      logisticsCostIndex: updatedState.logisticsCostIndex,
      supplyCostIndex: updatedState.supplyCostIndex,
      consumerDemandIndex: updatedState.consumerDemandIndex,
      geopoliticalRiskScore: updatedState.geopoliticalRiskScore,
      inflationRate: updatedState.inflationRate,
      baseInterestRate: updatedState.baseInterestRate,
    };

    await this.bridge.dispatchWorldEventToSimulation(
      event.companyId,
      event.id,
      result.simulationImpacts,
      snapshot,
    );

    await this.prisma.weWorldEvent.update({
      where: { id: worldEventId },
      data: { processedAt: new Date() },
    });
  }

  async getEvents(
    companyId: string,
    filters?: { category?: WeEventCategory; limit?: number; offset?: number },
  ): Promise<WeWorldEvent[]> {
    return this.prisma.weWorldEvent.findMany({
      where: {
        companyId,
        ...(filters?.category ? { category: filters.category } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
      include: { indicators: true },
    });
  }

  async createMockOilShock(companyId: string, magnitudePct: number): Promise<WeWorldEvent> {
    const prevPrice = 78.0;
    const newPrice = prevPrice * (1 + magnitudePct / 100);
    const key = `mock_oil_shock_${companyId}_${Date.now()}`;

    return this.ingest(companyId, {
      category: 'COMMODITY_PRICE',
      severity: magnitudePct >= 20 ? 'HIGH' : magnitudePct >= 10 ? 'MEDIUM' : 'LOW',
      source: 'MOCK',
      title: `Oil Price Shock +${magnitudePct}%`,
      description: `Brent crude oil price increased by ${magnitudePct}%, from $${prevPrice} to $${newPrice.toFixed(2)}/barrel`,
      rawData: { type: 'oil_shock', magnitudePct, prevPrice, newPrice },
      normalizedData: { magnitudePct },
      idempotencyKey: key,
      occurredAt: new Date(),
      indicators: [
        {
          indicatorType: 'OIL_PRICE_BRENT',
          value: newPrice,
          unit: 'USD/barrel',
          previousValue: prevPrice,
          deltaPercent: magnitudePct,
        },
      ],
    });
  }

  async createMockFxMove(companyId: string, fromRate: number, toRate: number): Promise<WeWorldEvent> {
    const key = `mock_fx_usd_inr_${companyId}_${Date.now()}`;
    return this.ingest(companyId, {
      category: 'FX_MOVEMENT',
      severity: Math.abs(toRate - fromRate) / fromRate >= 0.05 ? 'HIGH' : 'MEDIUM',
      source: 'MOCK',
      title: `USD/INR FX Movement: ${fromRate} → ${toRate}`,
      description: `USD/INR exchange rate moved from ${fromRate} to ${toRate}`,
      rawData: { fromRate, toRate },
      normalizedData: { usdInrRate: toRate, previousRate: fromRate },
      idempotencyKey: key,
      occurredAt: new Date(),
      indicators: [
        {
          indicatorType: 'USD_INR',
          value: toRate,
          unit: 'INR/USD',
          previousValue: fromRate,
          deltaPercent: ((toRate - fromRate) / fromRate) * 100,
        },
      ],
    });
  }

  async createMockRateHike(companyId: string, newRate: number): Promise<WeWorldEvent> {
    const key = `mock_rate_hike_${companyId}_${Date.now()}`;
    return this.ingest(companyId, {
      category: 'INTEREST_RATE',
      severity: 'MEDIUM',
      source: 'MOCK',
      title: `Interest Rate Updated: ${newRate}%`,
      description: `Base interest rate set to ${newRate}%`,
      rawData: { newRate },
      normalizedData: { newRate },
      idempotencyKey: key,
      occurredAt: new Date(),
      indicators: [
        {
          indicatorType: 'INTEREST_RATE_BASE',
          value: newRate,
          unit: 'percent',
        },
      ],
    });
  }
}
