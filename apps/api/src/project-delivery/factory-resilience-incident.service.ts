import { Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IncidentManagerService } from '../reliability/incident-manager.service';
import { RunbookEngineService } from '../reliability/runbook-engine.service';
import { IncidentSeverity } from '../reliability/incident.types';
import { ProbeTargetType } from '../reliability/health-probe.types';

@Injectable()
export class FactoryResilienceIncidentService {
  private readonly logger = new Logger(FactoryResilienceIncidentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly incidentManager?: IncidentManagerService,
    @Optional() private readonly runbookEngine?: RunbookEngineService,
  ) {}

  /**
   * Escalates factory execution anomalies, timeouts, and security violations into the V18 Incident Management system.
   */
  async escalateFactoryFailure(params: {
    companyId: string;
    projectId: string;
    stage: 'INTAKE' | 'TOOL_EXECUTION' | 'BUILD' | 'QUALITY_GATE' | 'DEPLOYMENT';
    errorMessage: string;
    details?: any;
  }) {
    const { companyId, projectId, stage, errorMessage, details } = params;

    this.logger.error(`[Factory Failure] Project ${projectId} failed during ${stage}: ${errorMessage}`);

    // 1. Mark Project BLOCKED in database
    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'BLOCKED' },
    });

    // 2. Track Project Cost or Failure Record
    await this.prisma.projectCost.create({
      data: {
        project: { connect: { id: projectId } },
        company: { connect: { id: companyId } },
        category: 'FAILURE_OVERHEAD',
        source: 'FACTORY_FAILURE',
        amount: 0,
        status: 'COMMITTED',
      },
    });

    // 3. Emit Incident Audit Event
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'FACTORY_INCIDENT_ESCALATED',
        payload: {
          projectId,
          stage,
          errorMessage,
          details: details as any,
          timestamp: new Date(),
        },
      },
    });

    // 4. If V18 IncidentManagerService is available, report incident formally
    if (this.incidentManager) {
      try {
        const severity = stage === 'QUALITY_GATE' && errorMessage.includes('security')
          ? IncidentSeverity.SEV1_CRITICAL
          : IncidentSeverity.SEV2_HIGH;

        const triage = await this.incidentManager.reportOrDeduplicateIncident({
          companyId,
          title: `Delivery Factory Failure: ${stage} (${projectId})`,
          description: errorMessage,
          severity,
          targetType: ProbeTargetType.MODEL_GATEWAY,
          targetName: `delivery_factory_${stage.toLowerCase()}`,
        });

        this.logger.log(`Triage completed for factory failure. Incident: ${triage?.id || 'triaged'}`);
        return triage;
      } catch (err: any) {
        this.logger.warn(`Failed to log formal resilience incident: ${err.message}`);
      }
    }

    return { escalated: true, projectId, stage };
  }
}
