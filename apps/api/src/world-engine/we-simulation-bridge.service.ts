import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeEventSeverity } from '@prisma/client';
import { SimulationImpact } from './we-interpretation.service';

const SEVERITY_PRIORITY: Record<WeEventSeverity, number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
};

@Injectable()
export class WeSimulationBridgeService {
  private readonly logger = new Logger(WeSimulationBridgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async dispatchWorldEventToSimulation(
    companyId: string,
    worldEventId: string,
    impacts: SimulationImpact[],
    marketStateSnapshot: Record<string, unknown>,
  ): Promise<void> {
    const state = await this.prisma.simulationState.findFirst();
    const simTime = state?.simulationTime ?? new Date();

    for (const impact of impacts) {
      const idempotencyKey = `we_${worldEventId}_${impact.type}_${impact.affectedAreas.join('_')}`;
      try {
        await this.prisma.simulationEvent.create({
          data: {
            type: impact.type,
            simulationTime: simTime,
            priority: SEVERITY_PRIORITY[impact.severity],
            payload: JSON.parse(JSON.stringify({
              worldEventId,
              affectedAreas: impact.affectedAreas,
              magnitude: impact.magnitude,
              description: impact.description,
              marketStateSnapshot,
              idempotencyKey,
              ...impact.payload,
            })),
          },
        });
      } catch (err: any) {
        // P2002 = unique constraint — idempotency guard via payload key is best-effort
        // SimulationEvent has no unique on idempotencyKey; log and skip to avoid duplicates
        if (err?.code !== 'P2002') {
          this.logger.warn(`Bridge dispatch for ${idempotencyKey}: ${err?.message}`);
        }
      }
    }
  }
}
