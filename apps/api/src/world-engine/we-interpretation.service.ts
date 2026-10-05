import { Injectable } from '@nestjs/common';
import { WeEventCategory, WeEventSeverity, WeIndicatorType } from '@prisma/client';

export interface SimulationImpact {
  type: 'ECONOMIC_SHOCK' | 'MARKET_TICK' | 'WORLD_EVENT';
  severity: WeEventSeverity;
  affectedAreas: string[];
  magnitude: number;
  description: string;
  payload: Record<string, unknown>;
}

export interface MarketStateDelta {
  energyCostIndex?: number;
  logisticsCostIndex?: number;
  supplyCostIndex?: number;
  usdInrRate?: number;
  eurUsdRate?: number;
  inflationRate?: number;
  baseInterestRate?: number;
  consumerDemandIndex?: number;
  geopoliticalRiskScore?: number;
  gdpGrowthRate?: number;
}

export interface InterpretationResult {
  delta: MarketStateDelta;
  simulationImpacts: SimulationImpact[];
}

const SEVERITY_RISK_WEIGHT: Record<WeEventSeverity, number> = {
  LOW: 0.05,
  MEDIUM: 0.15,
  HIGH: 0.30,
  CRITICAL: 0.50,
};

@Injectable()
export class WeInterpretationService {
  interpret(
    category: WeEventCategory,
    severity: WeEventSeverity,
    normalizedData: Record<string, unknown>,
    indicators: Array<{ indicatorType: WeIndicatorType; value: number; previousValue?: number | null; deltaPercent?: number | null }>,
  ): InterpretationResult {
    const delta: MarketStateDelta = {};
    const impacts: SimulationImpact[] = [];

    switch (category) {
      case WeEventCategory.COMMODITY_PRICE: {
        const oilIndicator = indicators.find(
          (i) => i.indicatorType === WeIndicatorType.OIL_PRICE_BRENT || i.indicatorType === WeIndicatorType.OIL_PRICE_WTI,
        );
        if (oilIndicator && oilIndicator.previousValue) {
          const pct = (oilIndicator.value - oilIndicator.previousValue) / oilIndicator.previousValue;
          delta.energyCostIndex = pct; // additive delta
          delta.logisticsCostIndex = pct * 0.67;
          delta.supplyCostIndex = pct * 0.43;
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['logistics', 'manufacturing', 'margins'],
            magnitude: pct,
            description: `Oil price ${pct >= 0 ? 'increase' : 'decrease'} of ${Math.abs(pct * 100).toFixed(1)}% affects energy, logistics, and supply costs`,
            payload: { indicatorType: oilIndicator.indicatorType, value: oilIndicator.value, previousValue: oilIndicator.previousValue, pct },
          });
        } else if (normalizedData.magnitudePct) {
          const pct = (normalizedData.magnitudePct as number) / 100;
          delta.energyCostIndex = pct;
          delta.logisticsCostIndex = pct * 0.67;
          delta.supplyCostIndex = pct * 0.43;
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['logistics', 'manufacturing', 'margins'],
            magnitude: pct,
            description: `Commodity price shift of ${((normalizedData.magnitudePct as number))}% affects energy and supply costs`,
            payload: { magnitudePct: normalizedData.magnitudePct, pct },
          });
        }
        break;
      }

      case WeEventCategory.FX_MOVEMENT: {
        const usdInr = indicators.find((i) => i.indicatorType === WeIndicatorType.USD_INR);
        const eurUsd = indicators.find((i) => i.indicatorType === WeIndicatorType.EUR_USD);
        if (usdInr) {
          delta.usdInrRate = usdInr.value;
          const prevRate = usdInr.previousValue ?? usdInr.value;
          const importImpact = (usdInr.value - prevRate) / prevRate;
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['imports', 'margins', 'procurement'],
            magnitude: importImpact,
            description: `USD/INR moved from ${prevRate} to ${usdInr.value} (+${(importImpact * 100).toFixed(2)}%) — import costs impacted`,
            payload: { usdInrRate: usdInr.value, prevRate, importImpact },
          });
        }
        if (eurUsd) {
          delta.eurUsdRate = eurUsd.value;
        }
        if (normalizedData.usdInrRate && !usdInr) {
          delta.usdInrRate = normalizedData.usdInrRate as number;
          const prevRate = (normalizedData.previousRate as number) ?? delta.usdInrRate;
          const importImpact = (delta.usdInrRate - prevRate) / prevRate;
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['imports', 'margins', 'procurement'],
            magnitude: importImpact,
            description: `USD/INR moved to ${delta.usdInrRate}`,
            payload: { usdInrRate: delta.usdInrRate, prevRate, importImpact },
          });
        }
        break;
      }

      case WeEventCategory.INTEREST_RATE: {
        const rateIndicator = indicators.find((i) => i.indicatorType === WeIndicatorType.INTEREST_RATE_BASE);
        const newRate = rateIndicator?.value ?? (normalizedData.newRate as number);
        if (newRate !== undefined) {
          delta.baseInterestRate = newRate;
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['financing', 'capital_cost', 'investment'],
            magnitude: rateIndicator?.deltaPercent ?? 0,
            description: `Base interest rate updated to ${newRate}%`,
            payload: { newRate },
          });
        }
        break;
      }

      case WeEventCategory.INFLATION: {
        const inflIndicator = indicators.find((i) => i.indicatorType === WeIndicatorType.INFLATION_RATE);
        const inflRate = inflIndicator?.value ?? (normalizedData.inflationRate as number);
        if (inflRate !== undefined) {
          delta.inflationRate = inflRate;
          delta.consumerDemandIndex = -(inflRate * 0.15);
          impacts.push({
            type: 'ECONOMIC_SHOCK',
            severity,
            affectedAreas: ['demand', 'pricing', 'wages'],
            magnitude: inflRate,
            description: `Inflation at ${inflRate}% reduces consumer demand index by ${(inflRate * 0.15).toFixed(3)}`,
            payload: { inflationRate: inflRate, demandImpact: -(inflRate * 0.15) },
          });
        }
        break;
      }

      case WeEventCategory.GEOPOLITICAL: {
        const riskWeight = SEVERITY_RISK_WEIGHT[severity];
        delta.geopoliticalRiskScore = riskWeight;
        impacts.push({
          type: 'ECONOMIC_SHOCK',
          severity,
          affectedAreas: ['supply_chain', 'trade', 'risk'],
          magnitude: riskWeight,
          description: `Geopolitical event (${severity}) increases risk score by ${riskWeight}`,
          payload: { riskWeight, severity },
        });
        break;
      }

      case WeEventCategory.SUPPLY_CHAIN: {
        const magnitude = (normalizedData.magnitudePct as number ?? 0) / 100;
        delta.supplyCostIndex = magnitude;
        delta.logisticsCostIndex = magnitude * 0.8;
        impacts.push({
          type: 'ECONOMIC_SHOCK',
          severity,
          affectedAreas: ['logistics', 'procurement', 'inventory'],
          magnitude,
          description: `Supply chain disruption increases supply cost by ${(magnitude * 100).toFixed(1)}%`,
          payload: { magnitude },
        });
        break;
      }

      default: {
        impacts.push({
          type: 'WORLD_EVENT',
          severity,
          affectedAreas: ['general'],
          magnitude: 0,
          description: `World event of category ${category} recorded`,
          payload: { category, normalizedData },
        });
        break;
      }
    }

    // Always emit a MARKET_TICK impact for downstream awareness
    impacts.push({
      type: 'MARKET_TICK',
      severity,
      affectedAreas: Object.keys(delta),
      magnitude: 0,
      description: `Market state tick from ${category} event`,
      payload: { delta },
    });

    return { delta, simulationImpacts: impacts };
  }
}
