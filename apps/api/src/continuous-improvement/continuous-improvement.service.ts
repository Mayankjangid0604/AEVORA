import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImprovementStatus } from '@prisma/client';

@Injectable()
export class ContinuousImprovementService {
  private readonly logger = new Logger(ContinuousImprovementService.name);

  constructor(private db: PrismaService) {}

  async detectImprovementOpportunities(companyId: string) {
    this.logger.log(`Detecting improvement opportunities for company ${companyId}`);
    // Simulate detecting a signal and creating a draft proposal
    return {
      message: 'Improvement opportunity detected. Run propose to create a proposal.',
      signals: ['High task failure rate in specific department', 'Elevated latency in process loop']
    };
  }

  async createProposal(data: any) {
    return this.db.improvementProposal.create({
      data: {
        companyId: data.companyId,
        title: data.title,
        description: data.description,
        problem: data.problem,
        observedSignal: data.observedSignal,
        hypothesis: data.hypothesis,
        proposedChange: data.proposedChange,
        expectedImpact: data.expectedImpact,
        expectedMetric: data.expectedMetric,
        baseline: data.baseline,
        target: data.target,
        confidence: data.confidence,
        risk: data.risk || 'MEDIUM',
        priority: data.priority || 'NORMAL',
        source: data.source || 'Manual',
        status: ImprovementStatus.PROPOSED
      }
    });
  }

  async listProposals(companyId: string) {
    return this.db.improvementProposal.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { outcomes: true }
    });
  }

  async getProposal(id: string) {
    const proposal = await this.db.improvementProposal.findUnique({
      where: { id },
      include: { outcomes: true }
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async approveProposal(id: string, approver: string) {
    const proposal = await this.db.improvementProposal.update({
      where: { id },
      data: {
        status: ImprovementStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: approver
      }
    });
    
    // Automatically trigger execution after approval for the "self-evolution engine" capability
    return this.executeProposal(id);
  }

  async rejectProposal(id: string, approver: string) {
    return this.db.improvementProposal.update({
      where: { id },
      data: {
        status: ImprovementStatus.REJECTED,
        approvedBy: approver
      }
    });
  }

  async executeProposal(id: string) {
    const proposal = await this.getProposal(id);
    
    // In V10, an executed proposal should ideally create a task in the V4 task engine.
    // For now we simulate execution state.
    const executed = await this.db.improvementProposal.update({
      where: { id },
      data: {
        status: ImprovementStatus.EXECUTING,
        executedAt: new Date()
      }
    });

    this.logger.log(`Proposal ${id} is executing. (V4 Task dispatch simulated)`);

    // Simulate completion
    setTimeout(() => {
      this.completeProposal(id).catch(console.error);
    }, 5000);

    return executed;
  }

  async completeProposal(id: string) {
    const completed = await this.db.improvementProposal.update({
      where: { id },
      data: {
        status: ImprovementStatus.COMPLETED,
        completedAt: new Date()
      }
    });

    // Auto-record an outcome for demonstration
    await this.recordOutcome(id, {
      measurementWindow: 'Immediate',
      actualResult: completed.target, // Simulated as matching target
      comparison: 'MET',
      learnedLesson: 'Changes applied successfully with expected impact.'
    });

    return completed;
  }

  async rollbackProposal(id: string) {
    return this.db.improvementProposal.update({
      where: { id },
      data: {
        status: ImprovementStatus.ROLLED_BACK,
        rolledBackAt: new Date()
      }
    });
  }

  async recordOutcome(id: string, data: any) {
    return this.db.improvementOutcome.create({
      data: {
        improvementProposalId: id,
        measurementWindow: data.measurementWindow,
        actualResult: data.actualResult,
        comparison: data.comparison,
        learnedLesson: data.learnedLesson
      }
    });
  }
}
