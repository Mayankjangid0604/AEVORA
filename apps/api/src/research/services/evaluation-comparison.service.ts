import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelVersionStatus } from '@prisma/client';

@Injectable()
export class EvaluationComparisonService {
  private readonly logger = new Logger(EvaluationComparisonService.name);

  constructor(private prisma: PrismaService) {}

  async compareCandidateToBaseline(experimentPlanId: string) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.experimentPlan.findUnique({ 
         where: { id: experimentPlanId },
         include: { baselineVersion: true, candidateVersion: true, hypothesis: true }
      });
      if (!plan || !plan.candidateVersion) throw new BadRequestException('Invalid plan or missing candidate');
      
      const baselineBench = plan.baselineVersion.benchmarkResults as any || {};
      const candidateBench = plan.candidateVersion.benchmarkResults as any || {};
      
      // Calculate diffs
      const baselineAcc = baselineBench.accuracy || 0;
      const candidateAcc = candidateBench.accuracy || 0;
      const accChange = candidateAcc - baselineAcc;

      const baselineLatency = baselineBench.latency || 0;
      const candidateLatency = candidateBench.latency || 0;
      const latencyChange = candidateLatency - baselineLatency;

      // explicit regression check
      let regressionDetected = false;
      const regressionDetails: any = {};

      if (latencyChange > 10) { // arbitrary threshold for latency regression
         regressionDetected = true;
         regressionDetails['latency'] = 'Unacceptable latency increase';
      }

      if (candidateAcc < baselineAcc) {
         regressionDetected = true;
         regressionDetails['accuracy'] = 'Accuracy degraded compared to baseline';
      }

      // overall result
      let overallResult = 'FAIL';
      if (!regressionDetected && accChange >= 0) {
         overallResult = 'PASS';
      }

      const comparison = await tx.modelComparison.create({
        data: {
          experimentPlanId: plan.id,
          baselineVersionId: plan.baselineVersionId,
          candidateVersionId: plan.candidateVersion.id,
          accuracyChange: accChange,
          latencyChange,
          regressionDetected,
          regressionDetails,
          overallResult
        }
      });

      // Update candidate status based on comparison
      if (overallResult === 'PASS') {
         await tx.modelVersion.update({ where: { id: plan.candidateVersion.id }, data: { status: ModelVersionStatus.APPROVED_FOR_LIMITED_DEPLOYMENT }});
         await tx.researchHypothesis.update({ where: { id: plan.hypothesis.id }, data: { status: 'VALIDATED' }});
      } else {
         await tx.modelVersion.update({ where: { id: plan.candidateVersion.id }, data: { status: ModelVersionStatus.REJECTED }});
         await tx.researchHypothesis.update({ where: { id: plan.hypothesis.id }, data: { status: 'FAILED' }});
      }

      await tx.companyEvent.create({
         data: { companyId: plan.hypothesis.companyId, type: 'MODEL_COMPARISON_COMPLETED', payload: { comparisonId: comparison.id, result: overallResult } }
      });

      return comparison;
    });
  }
}
