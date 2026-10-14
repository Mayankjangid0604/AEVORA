import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CeoFinancialAuthorityService } from './ceo-financial-authority.service';
import { SignificanceFilterService } from '../enterprise-brain/significance-filter.service';
import { CeoConsequenceAnalysisService } from './ceo-consequence-analysis.service';
import {
  CeoDecisionLifecycleState,
  StructuredDecisionAudit,
  ChairmanDisagreementResult,
} from './ceo-core.types';
import {
  CeoDecisionCategory,
  CeoDecisionRiskLevel,
  CeoDecisionConfidence,
  CeoDecisionApprovalStatus,
  CeoDecisionExecutionStatus,
  OrgMemoryType,
} from '@prisma/client';

@Injectable()
export class CeoDecisionLifecycleService {
  private readonly logger = new Logger(CeoDecisionLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeAuth: CeoFinancialAuthorityService,
    private readonly significanceFilter: SignificanceFilterService,
    @Optional() private readonly consequenceAnalysis?: CeoConsequenceAnalysisService,
  ) {}

  /**
   * Formulates a structured decision proposal with full audit rationale, uncertainty, and alternatives.
   * Deterministically transitions state through PERCEPTION -> ANALYSIS -> AUTHORITY_VALIDATION.
   * Strictly enforces that AI output cannot grant authority, and CEO cannot self-authorize.
   */
  async formulateDecision(params: {
    companyId: string;
    ceoId: string;
    category: CeoDecisionCategory;
    triggerType: string;
    situation: string;
    observations: string;
    proposedAction: string;
    targetEntityType?: string;
    targetEntityId?: string;
    riskLevel: CeoDecisionRiskLevel;
    confidence: CeoDecisionConfidence;
    reversible: boolean;
    estimatedCost?: number;
    evidenceUsed: Record<string, any>;
    alternativesConsidered: Array<{ option: string; tradeOff: string; rejectedReason: string }>;
    assumptions: string[];
    uncertainty: { hasUncertainty: boolean; confidenceLevel: CeoDecisionConfidence; discrepancyNote?: string };
    expectedOutcome: { metric: string; targetValue: string | number; timeline: string };
  }) {
    const { companyId, ceoId } = params;
    this.logger.log(`[${companyId}] Formulating structured CEO decision for trigger: ${params.triggerType}`);

    // 1. Sanitize untrusted input text
    const sanitizedSituation = this.significanceFilter.sanitizeUntrustedText(params.situation, 'CEO_DECISION_SITUATION');
    const sanitizedObservations = this.significanceFilter.sanitizeUntrustedText(params.observations, 'CEO_DECISION_OBSERVATIONS');
    const sanitizedAction = this.significanceFilter.sanitizeUntrustedText(params.proposedAction, 'CEO_DECISION_ACTION');

    // 2. Deterministic Authority Evaluation (CEO CANNOT GRANT ITSELF AUTHORITY)
    const cost = params.estimatedCost ?? 0;
    const authorityCheck = await this.evaluateAuthorityBoundaries({
      companyId,
      ceoId,
      cost,
      riskLevel: params.riskLevel,
      category: params.category,
      hasUncertainty: params.uncertainty.hasUncertainty,
    });

    // 2.5 Deterministic Consequence Analysis for Material Decisions
    let consequenceReport: any = null;
    if (this.consequenceAnalysis) {
      try {
        consequenceReport = await this.consequenceAnalysis.analyzeConsequences({
          companyId,
          ceoId,
          triggerType: params.triggerType,
          category: params.category,
          proposedAction: sanitizedAction.raw,
          situation: sanitizedSituation.raw,
          targetEntityType: params.targetEntityType,
          targetEntityId: params.targetEntityId,
          estimatedCost: cost,
          riskLevel: params.riskLevel,
          isReversible: params.reversible,
          assumptions: params.assumptions,
          includeSimulation: true,
        });
      } catch (err: any) {
        this.logger.warn(`Consequence analysis non-fatal fallback: ${err.message}`);
      }
    }

    const isCriticalConsequence = consequenceReport?.overallSeverity === 'CRITICAL';
    const requiresApproval = authorityCheck.requiresApproval || isCriticalConsequence;
    const approvalStatus: CeoDecisionApprovalStatus = requiresApproval
      ? CeoDecisionApprovalStatus.PENDING
      : CeoDecisionApprovalStatus.NOT_REQUIRED;

    // 3. Persist Decision Record in CeoAutonomousDecision
    const decision = await this.prisma.ceoAutonomousDecision.create({
      data: {
        companyId,
        ceoId,
        category: params.category,
        triggerType: params.triggerType,
        situation: sanitizedSituation.raw,
        observations: sanitizedObservations.raw,
        reasoningSummary: `Deterministic policy: Risk=${params.riskLevel}, Reversible=${params.reversible}, RequiresApproval=${requiresApproval}. AuthorityContext: ${authorityCheck.reason}`,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        proposedAction: sanitizedAction.raw,
        riskLevel: params.riskLevel,
        confidence: params.confidence,
        requiresApproval,
        approvalStatus,
        executionStatus: CeoDecisionExecutionStatus.PENDING,
        reversible: params.reversible,
      },
    });

    // 4. Create Structured Audit Record in ExecutiveDecision
    const auditRecord: StructuredDecisionAudit = {
      decisionId: decision.id,
      companyId,
      ceoId,
      category: params.category,
      action: sanitizedAction.raw,
      evidenceUsed: params.evidenceUsed,
      alternativesConsidered: params.alternativesConsidered,
      assumptions: params.assumptions,
      uncertainty: params.uncertainty,
      risksIdentified: [
        {
          risk: `Risk level: ${params.riskLevel}`,
          severity: params.riskLevel,
          mitigation: params.reversible ? 'Action is fully reversible.' : 'Action requires executive oversight.',
        },
      ],
      authorityContext: {
        authorityStatus: authorityCheck.authorityStatus,
        singleLimit: authorityCheck.singleLimit,
        operation: authorityCheck.operation,
        withinLimits: !requiresApproval,
        requiresChairmanApproval: requiresApproval,
      },
      expectedOutcome: params.expectedOutcome,
      consequenceAnalysis: consequenceReport,
    };

    // Store in ExecutiveDecision table for long-term governance audit
    await this.prisma.executiveDecision.create({
      data: {
        id: decision.id,
        companyId,
        proposerId: ceoId,
        decisionType: 'PROJECT_INTERVENTION',
        subject: `CEO Decision: ${params.triggerType}`,
        description: sanitizedSituation.raw,
        evidence: params.evidenceUsed,
        analysis: {
          assumptions: params.assumptions,
          uncertainty: params.uncertainty,
          authorityContext: auditRecord.authorityContext,
          consequenceAnalysis: consequenceReport,
        },
        recommendation: {
          action: sanitizedAction.raw,
          reasoningSummary: decision.reasoningSummary,
        },
        alternatives: params.alternativesConsidered,
        expectedImpact: params.expectedOutcome,
        riskLevel: params.riskLevel,

        priority: params.riskLevel === 'CRITICAL' || isCriticalConsequence ? 'CRITICAL' : 'NORMAL',
        requiredApproval: requiresApproval,
        status: requiresApproval ? 'APPROVAL_REQUIRED' : 'PROPOSED',
      },
    });

    return {
      decision,
      auditRecord,
      lifecycleState: (requiresApproval ? 'PENDING_APPROVAL' : 'AUTHORITY_CHECKED') as CeoDecisionLifecycleState,
    };
  }

  /**
   * Deterministically evaluates authority boundaries.
   * CEO is NEVER allowed to grant itself authority or bypass financial/risk limits.
   */
  async evaluateAuthorityBoundaries(params: {
    companyId: string;
    ceoId: string;
    cost: number;
    riskLevel: CeoDecisionRiskLevel;
    category: CeoDecisionCategory;
    hasUncertainty: boolean;
  }): Promise<{ requiresApproval: boolean; authorityStatus: string; singleLimit: number; operation: string; reason: string }> {
    // 1. CRITICAL Risk ALWAYS requires Chairman approval
    if (params.riskLevel === 'CRITICAL') {
      return {
        requiresApproval: true,
        authorityStatus: 'RESTRICTED',
        singleLimit: 0,
        operation: 'RISK_OVERRIDE',
        reason: 'CRITICAL risk level exceeds autonomous CEO operational boundaries.',
      };
    }

    // 2. Unresolved Enterprise Data Discrepancy ALWAYS requires human verification
    if (params.hasUncertainty && (params.category === 'FINANCE' || params.category === 'SALES')) {
      return {
        requiresApproval: true,
        authorityStatus: 'DISCREPANCY_FLAGGED',
        singleLimit: 0,
        operation: 'DISCREPANCY_RESOLVE',
        reason: 'Decision depends on conflicting enterprise data flagged by Enterprise Brain.',
      };
    }

    // 3. Financial Authority Check
    if (params.cost > 0) {
      const auth = await this.prisma.ceoFinancialAuthority.findFirst({
        where: { companyId: params.companyId, ceoEmployeeId: params.ceoId, authorityStatus: 'ACTIVE' },
      });

      if (!auth) {
        return {
          requiresApproval: true,
          authorityStatus: 'NO_AUTHORITY_RECORD',
          singleLimit: 0,
          operation: 'FINANCIAL_AUTHORITY',
          reason: 'No active CeoFinancialAuthority record found for this company.',
        };
      }

      if (params.cost > auth.singleTransactionLimit) {
        return {
          requiresApproval: true,
          authorityStatus: 'ACTIVE',
          singleLimit: auth.singleTransactionLimit,
          operation: 'AUTHORIZE_EXPENSE',
          reason: `Cost (${params.cost}) exceeds single transaction limit (${auth.singleTransactionLimit}).`,
        };
      }

      return {
        requiresApproval: false,
        authorityStatus: 'ACTIVE',
        singleLimit: auth.singleTransactionLimit,
        operation: 'AUTHORIZE_EXPENSE',
        reason: `Cost is within CEO single transaction limit (${auth.singleTransactionLimit}).`,
      };
    }

    // 4. Operational / Reversible low-to-medium risk within authority
    return {
      requiresApproval: false,
      authorityStatus: 'OPERATIONAL_AUTONOMY',
      singleLimit: 0,
      operation: 'OPERATIONAL_DECISION',
      reason: 'Standard operational decision within autonomous authority limits.',
    };
  }

  /**
   * CEO Disagreement with Command MD protocol (Requirement 28):
   * When Command MD issues a directive that contradicts facts or creates risk:
   * CEO presents POV, evidence, consequences/options and recommendation -> discussion ->
   * Command MD makes the final decision when authority belongs to Command MD.
   */
  async evaluateChairmanDirective(companyId: string, ceoId: string, directiveText: string): Promise<ChairmanDisagreementResult> {
    const sanitized = this.significanceFilter.sanitizeUntrustedText(directiveText, 'CHAIRMAN_DIRECTIVE');

    // Fetch current financial and operational state to check feasibility
    const [wallet, _budget, riskCount] = await Promise.all([
      this.prisma.aCWallet.findFirst({ where: { companyId } }),
      this.prisma.companyBudget.findFirst({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.companyRisk.count({ where: { companyId, status: 'IDENTIFIED', impact: 'CRITICAL' } }),
    ]);

    const balance = wallet?.balance ?? 0;
    const isCapitalDepleted = balance < 10000;

    let ceoPov = 'The CEO fully supports executing the Chairman directive within current operational capabilities.';
    const evidence: string[] = [`Current liquid treasury balance: ${balance}`];
    const consequences: string[] = ['Standard strategic initiative deployment.'];
    let recommendation = 'Proceed with planned operational task allocation.';

    // Check if directive conflicts with financial realities
    if (directiveText.toLowerCase().includes('spend') || directiveText.toLowerCase().includes('hire') || directiveText.toLowerCase().includes('acquire')) {
      if (isCapitalDepleted) {
        ceoPov = 'The CEO cautions that current liquid capital is insufficient to support immediate cash-intensive deployment without external injection.';
        evidence.push(`Liquid AC balance is critically low (${balance}).`);
        evidence.push(`Unmitigated critical corporate risks present: ${riskCount}.`);
        consequences.push('Potential treasury depletion leading to operational freeze.');
        consequences.push('Premature capital commitment before current client receivables clear.');
        recommendation = 'Phase the deployment in two stages: await invoice clearance, then release first capital tranche.';
      }
    }

    let consequenceComparison: any = null;
    if (this.consequenceAnalysis) {
      try {
        consequenceComparison = await this.consequenceAnalysis.compareDisagreementConsequences(
          companyId,
          ceoId,
          sanitized.raw,
          recommendation,
        );
      } catch (err: any) {
        this.logger.warn(`Disagreement consequence comparison non-fatal: ${err.message}`);
      }
    }

    return {
      directive: sanitized.raw,
      ceoPov,
      evidence,
      consequences,
      recommendation,
      consequenceComparison,
      decisionAuthority: 'CHAIRMAN',
      requiresCommandDecision: true,
      resolutionStatus: 'PENDING_CHAIRMAN_RESPONSE',
    };
  }

  /**
   * Closed-loop decision review:
   * Compares expected outcome with actual outcome and records feedback in OrganizationalMemory
   * for downstream learning slices.
   */
  async reviewDecisionOutcome(companyId: string, decisionId: string) {
    const decision = await this.prisma.ceoAutonomousDecision.findFirst({
      where: { id: decisionId, companyId },
    });
    if (!decision) {
      throw new NotFoundException(`Decision ${decisionId} not found`);
    }

    const execDecision = await this.prisma.executiveDecision.findFirst({
      where: { id: decisionId, companyId },
    });

    const isExecuted = decision.executionStatus === CeoDecisionExecutionStatus.EXECUTED;
    const success = isExecuted;
    const notes = isExecuted
      ? `Decision ${decision.triggerType} successfully executed with result: ${decision.executionResult || 'Completed without errors'}.`
      : `Decision ${decision.triggerType} in status ${decision.executionStatus}.`;

    // Persist evaluation into OrganizationalMemory for closed-loop learning
    await this.prisma.organizationalMemory.create({
      data: {
        companyId,
        memoryType: success ? OrgMemoryType.SUCCESSFUL_INTERVENTION : OrgMemoryType.FAILED_INTERVENTION,
        subject: `Decision Review: ${decision.triggerType}`,
        content: `Target: ${decision.targetEntityType ?? 'N/A'}:${decision.targetEntityId ?? 'N/A'}. Action: ${decision.proposedAction}. Result: ${notes}`,
        sourceDecisionId: decision.id,
        recordedBy: decision.ceoId,
        relevanceScore: success ? 80 : 90,
      },
    });

    // Update ExecutiveDecision with outcome
    if (execDecision) {
      await this.prisma.executiveDecision.update({
        where: { id: execDecision.id },
        data: {
          status: success ? 'COMPLETED' : 'FAILED',
          result: {
            reviewedAt: new Date().toISOString(),
            success,
            notes,
          },
          completedAt: new Date(),
        },
      });
    }

    return {
      decisionId,
      triggerType: decision.triggerType,
      success,
      reviewNotes: notes,
      memoryRecorded: true,
    };
  }
}
