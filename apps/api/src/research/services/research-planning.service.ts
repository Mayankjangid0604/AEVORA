import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResearchProposalStatus } from '@prisma/client';

@Injectable()
export class ResearchPlanningService {
  private readonly logger = new Logger(ResearchPlanningService.name);

  constructor(private prisma: PrismaService) {}

  async createHypothesisFromSignal(signalId: string, creatorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const signal = await tx.improvementSignal.findUnique({ where: { id: signalId }, include: { modelVersion: true } });
      if (!signal) throw new BadRequestException('Signal not found');

      // Check idempotency
      const existing = await tx.researchHypothesis.findFirst({
         where: { companyId: signal.companyId, modelFamilyId: signal.modelVersion.modelId, status: 'PROPOSED' }
      });
      if (existing) return existing;

      if (signal.status !== 'OPEN') throw new BadRequestException('Signal is already addressed');

      let hypothesisText = '';
      let expectedImprovement = '';

      if (signal.signalType === 'FEEDBACK_DISAGREEMENT') {
         hypothesisText = `Retraining the model on recently rejected task feedback will reduce prediction errors.`;
         expectedImprovement = `Reduce ${signal.metric} below ${signal.baselineValue}`;
      } else {
         hypothesisText = `Investigating the cause of ${signal.signalType} to improve model performance.`;
         expectedImprovement = `Restore performance to acceptable baseline.`;
      }

      const hypothesis = await tx.researchHypothesis.create({
         data: {
           companyId: signal.companyId,
           modelFamilyId: signal.modelVersion.modelId,
           problemStatement: `Observed ${signal.signalType} with severity ${signal.severity}. Observed: ${signal.observedValue}, Baseline: ${signal.baselineValue}`,
           hypothesis: hypothesisText,
           expectedImprovement: expectedImprovement,
           successCriteria: expectedImprovement,
           creatorId,
           evidenceReferences: JSON.stringify([signalId])
         }
      });

      await tx.improvementSignal.update({ where: { id: signalId }, data: { status: 'REVIEWING' } });

      await tx.companyEvent.create({
         data: { companyId: signal.companyId, type: 'RESEARCH_HYPOTHESIS_CREATED', payload: { hypothesisId: hypothesis.id } }
      });

      return hypothesis;
    });
  }

  async createProposalFromHypothesis(hypothesisId: string) {
    const hypothesis = await this.prisma.researchHypothesis.findUnique({ where: { id: hypothesisId }, include: { modelFamily: true } });
    if (!hypothesis) throw new BadRequestException('Hypothesis not found');

    // Research proposals require governance approval, this is just drafting it
    const proposal = await this.prisma.researchProposal.create({
      data: {
        companyId: hypothesis.companyId,
        title: `Improvement Proposal: ${hypothesis.modelFamily.name}`,
        description: `Addressing problem: ${hypothesis.problemStatement}`,
        researchQuestion: `Can we improve ${hypothesis.modelFamily.name} to meet expected thresholds?`,
        hypothesis: hypothesis.hypothesis,
        objectives: hypothesis.expectedImprovement,
        requestedBudget: 1000,
        requestedCompute: 50,
        riskLevel: "LOW",
        status: ResearchProposalStatus.DRAFT,
        proposerId: hypothesis.creatorId
      }
    });

    await this.prisma.companyEvent.create({
       data: { companyId: hypothesis.companyId, type: 'RESEARCH_PROPOSAL_CREATED', payload: { proposalId: proposal.id } }
    });

    return proposal;
  }
}
