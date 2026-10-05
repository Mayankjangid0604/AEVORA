import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelRegistryService } from './model-registry.service';

@Injectable()
export class ImprovementObservationService {
  private readonly logger = new Logger(ImprovementObservationService.name);

  constructor(private prisma: PrismaService, private registry: ModelRegistryService) {}

  async detectImprovementSignals(companyId: string) {
    this.logger.log(`Scanning for improvement signals in company ${companyId}`);
    
    // Find ALL active limited deployments across ALL capabilities
    const deployments = await this.prisma.limitedDeployment.findMany({
      where: { status: 'ACTIVE', modelVersion: { companyId } },
      include: { modelVersion: { include: { modelFamily: { include: { capability: true } } } } }
    });

    for (const deployment of deployments) {
      const capability = deployment.modelVersion.modelFamily.capability;
      if (!capability) continue; // Only process models linked to capabilities

      // Find rejected feedbacks for this model version
      const rejectedFeedbacks = await this.prisma.modelFeedback.count({
        where: {
          modelVersionId: deployment.modelVersionId,
          status: 'REJECTED',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
        }
      });

      if (rejectedFeedbacks > 5) { // Arbitrary threshold
        await this.createSignal({
          companyId,
          modelVersionId: deployment.modelVersionId,
          signalType: 'FEEDBACK_DISAGREEMENT',
          severity: 'HIGH',
          metric: 'Rejected Feedback Count',
          observedValue: rejectedFeedbacks,
          baselineValue: 5,
          evidenceReference: `model_feedback_rejected_count_${capability.name}`
        });
      }
    }
  }

  async createSignal(data: { companyId: string, modelVersionId: string, signalType: string, severity: string, metric: string, observedValue: number, baselineValue: number, evidenceReference: string }) {
    // Idempotency check
    const existing = await this.prisma.improvementSignal.findFirst({
      where: {
        companyId: data.companyId,
        modelVersionId: data.modelVersionId,
        signalType: data.signalType,
        status: 'OPEN'
      }
    });

    if (existing) {
       this.logger.debug(`Signal ${data.signalType} already open for model ${data.modelVersionId}`);
       return existing;
    }

    const signal = await this.prisma.improvementSignal.create({ data });
    this.logger.log(`Created new Improvement Signal: ${signal.id}`);
    
    // Audit event
    await this.prisma.companyEvent.create({
       data: {
         companyId: data.companyId,
         type: 'IMPROVEMENT_SIGNAL_CREATED',
         payload: { signalId: signal.id, type: signal.signalType }
       }
    });

    return signal;
  }
}
