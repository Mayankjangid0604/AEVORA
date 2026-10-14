import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectComplexity, ScopeBudgetAssessmentResult } from './project-delivery.types';

@Injectable()
export class ScopeBudgetAssessmentService {
  private readonly logger = new Logger(ScopeBudgetAssessmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluates project requirements and scope deterministically.
   * Calculates complexity tier, effort, cost, margin, and risk matrix.
   */
  async assessProjectScopeAndBudget(projectId: string): Promise<ScopeBudgetAssessmentResult> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { requirements: true },
    });

    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    const reqs = project.requirements;
    const reqCount = reqs.length;

    // 1. Complexity Assessment
    let complexityScore = 10; // base score
    complexityScore += reqCount * 5;

    let hasSecurity = false;
    let hasIntegration = false;

    for (const r of reqs) {
      const desc = (r.description + ' ' + r.title).toLowerCase();
      if (desc.includes('security') || desc.includes('auth') || desc.includes('permission')) {
        complexityScore += 15;
        hasSecurity = true;
      }
      if (desc.includes('api') || desc.includes('integration') || desc.includes('external') || desc.includes('webhook')) {
        complexityScore += 12;
        hasIntegration = true;
      }
      if (r.priority === 'URGENT') {
        complexityScore += 10;
      }
    }

    let complexity: ProjectComplexity;
    if (complexityScore < 30) {
      complexity = ProjectComplexity.LOW;
    } else if (complexityScore < 65) {
      complexity = ProjectComplexity.MEDIUM;
    } else if (complexityScore < 100) {
      complexity = ProjectComplexity.HIGH;
    } else {
      complexity = ProjectComplexity.ENTERPRISE;
    }

    // 2. Effort & Budget Estimation
    // LOW: ~20h, MEDIUM: ~60h, HIGH: ~140h, ENTERPRISE: ~300h
    const baseHoursPerPoint = 1.8;
    const estimatedEffortHours = Math.round(complexityScore * baseHoursPerPoint);

    // Costing: e.g. 50,000 paise (500 INR) per hour internal cost
    const hourlyCostPaise = 50000;
    const estimatedCostPaise = estimatedEffortHours * hourlyCostPaise;

    // Recommended margin target based on complexity
    const targetMarginPercent = complexity === ProjectComplexity.LOW ? 35 : complexity === ProjectComplexity.MEDIUM ? 40 : 50;
    const recommendedQuotedPricePaise = Math.round(estimatedCostPaise / (1 - targetMarginPercent / 100));

    // 3. Risk Identification & Quantification
    const risksIdentified: Array<{
      title: string;
      description: string;
      probability: number;
      impact: number;
      severity: number;
      mitigation: string;
    }> = [];

    // Schedule risk
    const scheduleProb = reqCount > 5 ? 40 : 20;
    const scheduleImpact = 50;
    risksIdentified.push({
      title: 'Schedule Slippage Risk',
      description: `Project contains ${reqCount} requirements requiring ~${estimatedEffortHours}h of execution effort.`,
      probability: scheduleProb,
      impact: scheduleImpact,
      severity: Math.floor((scheduleProb * scheduleImpact) / 100),
      mitigation: 'Implement phased milestone task decomposition and automated CI test quality gates.',
    });

    if (hasSecurity) {
      const secProb = 25;
      const secImpact = 80;
      risksIdentified.push({
        title: 'Security and Authorization Compliance Risk',
        description: 'Project includes sensitive authentication and security requirements.',
        probability: secProb,
        impact: secImpact,
        severity: Math.floor((secProb * secImpact) / 100),
        mitigation: 'Enforce static credential leak scans and V17 Governed Authority verification before release.',
      });
    }

    if (hasIntegration) {
      const intProb = 35;
      const intImpact = 60;
      risksIdentified.push({
        title: 'Third-Party Integration Boundary Risk',
        description: 'External API or integration points may introduce network latency or rate-limiting.',
        probability: intProb,
        impact: intImpact,
        severity: Math.floor((intProb * intImpact) / 100),
        mitigation: 'Implement deterministic mock adapters and timeout boundaries for external actions.',
      });
    }

    // Persist Risks into database
    for (const r of risksIdentified) {
      const existing = await this.prisma.projectRisk.findFirst({
        where: { projectId, title: r.title },
      });
      if (!existing) {
        await this.prisma.projectRisk.create({
          data: {
            projectId,
            title: r.title,
            description: r.description,
            probability: r.probability,
            impact: r.impact,
            severity: r.severity,
            mitigation: r.mitigation,
          },
        });
      }
    }

    // Update project budget metrics
    await this.prisma.project.update({
      where: { id: projectId },
      data: {
        estimatedCost: estimatedCostPaise,
        quotedPrice: project.quotedPrice || recommendedQuotedPricePaise,
        margin: targetMarginPercent,
      },
    });

    const result: ScopeBudgetAssessmentResult = {
      complexity,
      complexityScore,
      estimatedEffortHours,
      estimatedCostPaise,
      recommendedQuotedPricePaise,
      projectedMarginPercent: targetMarginPercent,
      scheduleSlippageRiskScore: Math.floor((scheduleProb * scheduleImpact) / 100),
      risksIdentified,
    };

    this.logger.log(`Project assessment completed for ${projectId}: Complexity=${complexity} (score ${complexityScore})`);
    return result;
  }
}
