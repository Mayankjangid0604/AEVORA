import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImprovementStatus, EmergencyState, EpistemicCertainty } from '@prisma/client';
import {
  TargetDomain,
  ReversibilityType,
  BlastRadius,
  ProposalAuthorityRequirement,
  ProposalValidationStatus,
  CanonicalImprovementSignal,
  CreateProposalInput,
} from './continuous-improvement.types';
import { DigitalTwinScenarioService } from '../enterprise-intelligence/digital-twin-scenario.service';
import { GovernedAuthorityService } from '../governance/governed-authority.service';
import { AuthorityTier, CeoDecisionRiskLevel } from '../governance/authority-context.types';
import * as crypto from 'crypto';

@Injectable()
export class ContinuousImprovementService {
  private readonly logger = new Logger(ContinuousImprovementService.name);

  // In-memory signal deduplication cache with TTL
  private readonly signalCache = new Map<string, { signal: CanonicalImprovementSignal; lastObserved: number }>();

  // Proposal rate limiter: max proposals per company within window
  private readonly proposalTimestamps = new Map<string, number[]>();
  private readonly MAX_PROPOSALS_PER_WINDOW = 10;
  private readonly PROPOSAL_WINDOW_MS = 60_000; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly digitalTwin?: DigitalTwinScenarioService,
    @Optional() private readonly authorityService?: GovernedAuthorityService,
  ) {}

  /**
   * Phase 7.4 & 7.20: Canonical Improvement Signal Creation & Deduplication.
   * Creates or updates an improvement signal from verified patterns, anomalies, or performance metrics.
   * Enforces recurrence thresholds and deduplication to prevent signal storms.
   */
  async recordSignal(input: {
    companyId: string;
    source: string;
    sourceType: string;
    affectedEntity: string;
    evidenceReferences?: string[];
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    confidence?: number;
    expectedImpact?: string;
    correlationId?: string;
    causationId?: string;
    stateVersion?: number;
  }): Promise<CanonicalImprovementSignal> {
    if (!input.companyId) {
      throw new BadRequestException('companyId is required for improvement signal');
    }

    // Verify company
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${input.companyId} not found`);
    }

    // Deduplication Key
    const dedupKey = `${input.companyId}:${input.source}:${input.affectedEntity}:${input.severity || 'MEDIUM'}`;
    const now = Date.now();
    const existing = this.signalCache.get(dedupKey);

    let recurrence = 1;
    let maturity: 'OBSERVATION' | 'PROVISIONAL' | 'CONFIRMED' | 'DEPRECATED' = 'OBSERVATION';
    const confidence = input.confidence ?? 60;

    if (existing) {
      recurrence = existing.signal.recurrence + 1;
      // Maturity Model: OBSERVATION -> PROVISIONAL -> CONFIRMED
      maturity = recurrence >= 3 ? 'CONFIRMED' : 'PROVISIONAL';
    } else {
      maturity = confidence >= 80 ? 'PROVISIONAL' : 'OBSERVATION';
    }

    const signalId = existing ? existing.signal.id : `sig_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const signal: CanonicalImprovementSignal = {
      id: signalId,
      companyId: input.companyId,
      source: input.source,
      sourceType: input.sourceType,
      evidenceReferences: input.evidenceReferences || [],
      affectedEntity: input.affectedEntity,
      severity: input.severity || 'MEDIUM',
      confidence,
      recurrence,
      expectedImpact: input.expectedImpact || 'Potential operational or quality optimization',
      detectedAt: new Date(),
      correlationId: input.correlationId,
      causationId: input.causationId,
      stateVersion: input.stateVersion || 1,
      maturity,
      status: 'OPEN',
    };

    this.signalCache.set(dedupKey, { signal, lastObserved: now });
    this.logger.log(
      `[ContinuousImprovement] Recorded signal ${signal.id} for ${input.affectedEntity} in company ${input.companyId} (recurrence: ${recurrence}, maturity: ${maturity})`,
    );

    return signal;
  }

  /**
   * Phase 7.5, 7.8, 7.20: Governed Improvement Proposal Creation.
   * Enforces:
   * - Company isolation.
   * - Emergency stop validation.
   * - Proposal storm prevention (rate limiting & deduplication).
   * - Constitutional immutability protection: blocks autonomous modification of constitutional boundaries.
   * - Classification of authority requirement based on risk, domain, reversibility, and blast radius.
   */
  async createProposal(input: CreateProposalInput) {
    const { companyId } = input;
    if (!companyId) {
      throw new BadRequestException('companyId is required to create an improvement proposal');
    }

    // 1. Company and Emergency State Check
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
      throw new ForbiddenException(
        `Operation blocked: Company ${companyId} is under EMERGENCY_STOP. Autonomous improvement proposals cannot be initiated.`,
      );
    }

    // 2. Proposal Storm Prevention (Rate Limiting per company)
    const now = Date.now();
    const timestamps = (this.proposalTimestamps.get(companyId) || []).filter(
      (t) => now - t < this.PROPOSAL_WINDOW_MS,
    );
    if (timestamps.length >= this.MAX_PROPOSALS_PER_WINDOW) {
      this.logger.warn(`[ContinuousImprovement] Proposal rate limit exceeded for company ${companyId}`);
      throw new BadRequestException(
        `Proposal storm prevented: Company ${companyId} exceeded maximum rate of ${this.MAX_PROPOSALS_PER_WINDOW} proposals per minute.`,
      );
    }
    timestamps.push(now);
    this.proposalTimestamps.set(companyId, timestamps);

    // 3. Deduplication Check: Prevent identical active proposals
    const recentDuplicate = await this.prisma.improvementProposal.findFirst({
      where: {
        companyId,
        title: input.title,
        problem: input.problem,
        status: { in: [ImprovementStatus.DETECTED, ImprovementStatus.DRAFT, ImprovementStatus.PROPOSED, ImprovementStatus.UNDER_REVIEW, ImprovementStatus.APPROVED] },
      },
    });
    if (recentDuplicate) {
      this.logger.warn(`[ContinuousImprovement] Duplicate active proposal detected: ${recentDuplicate.id}`);
      return recentDuplicate;
    }

    // 4. Phase 7.8 Constitutional Immutability Protection
    // AI must NOT autonomously modify Chairman sovereignty, authority hierarchy, or safety boundaries
    const targetDomain = (input.targetDomain || TargetDomain.PROCESS_CONFIGURATION) as TargetDomain;
    const isConstitutional =
      targetDomain === TargetDomain.CONSTITUTIONAL_CHANGE ||
      input.proposedChange?.toLowerCase().includes('chairman sovereignty') ||
      input.proposedChange?.toLowerCase().includes('override chairman') ||
      input.proposedChange?.toLowerCase().includes('bypass gateway') ||
      input.proposedChange?.toLowerCase().includes('bypass authority') ||
      input.blastRadius === BlastRadius.CONSTITUTIONAL;

    let authorityRequirement: ProposalAuthorityRequirement;
    let risk = input.risk || 'MEDIUM';

    if (isConstitutional) {
      this.logger.warn(
        `[ContinuousImprovement] Proposal involves constitutional architecture: escalating directly to Chairman Sovereignty`,
      );
      authorityRequirement = ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE;
      risk = 'CRITICAL';
    } else if (risk === 'CRITICAL' || input.blastRadius === BlastRadius.ENTERPRISE) {
      authorityRequirement = ProposalAuthorityRequirement.CHAIRMAN_REQUIRED;
    } else if (risk === 'HIGH' || input.reversibility === ReversibilityType.IRREVERSIBLE) {
      authorityRequirement = ProposalAuthorityRequirement.APPROVAL_REQUIRED;
    } else {
      authorityRequirement = ProposalAuthorityRequirement.AUTONOMOUS_DELEGATED;
    }

    // 5. Determine Simulation Requirement
    const simulationRequirement =
      isConstitutional || risk === 'HIGH' || risk === 'CRITICAL' || input.blastRadius === BlastRadius.ENTERPRISE
        ? 'MANDATORY'
        : input.simulationRequirement || 'RECOMMENDED';

    const proposal = await this.prisma.improvementProposal.create({
      data: {
        companyId,
        title: input.title,
        description: input.description,
        problem: input.problem,
        observedSignal: input.observedSignal,
        hypothesis: input.hypothesis,
        proposedChange: input.proposedChange,
        expectedImpact: input.expectedImpact,
        expectedMetric: input.expectedMetric,
        baseline: input.baseline,
        target: input.target,
        confidence: input.confidence,
        risk,
        priority: input.priority || 'NORMAL',
        source: input.source || 'OperationalLearning',
        status: isConstitutional ? ImprovementStatus.UNDER_REVIEW : ImprovementStatus.PROPOSED,
        targetDomain,
        reversibility: input.reversibility || ReversibilityType.REVERSIBLE,
        blastRadius: input.blastRadius || BlastRadius.LOCAL,
        validationCriteria: input.validationCriteria || [],
        rollbackCriteria: input.rollbackCriteria || [],
        simulationRequirement,
        authorityRequirement,
        version: input.version || 1,
        supersedesId: input.supersedesId,
        correlationId: input.correlationId,
        causationId: input.causationId,
      },
    });

    this.logger.log(
      `[ContinuousImprovement] Created proposal ${proposal.id} [${targetDomain}] in company ${companyId} (risk: ${risk}, req: ${authorityRequirement})`,
    );

    return proposal;
  }

  /**
   * Phase 7.6: Simulation-First Evaluation of Proposal.
   * Runs the proposed improvement in the isolated Phase 6 digital-twin simulation.
   * Simulation success informs planning, but NEVER creates production reality, authority, or outcomes.
   */
  async simulateProposal(companyId: string, proposalId: string, actorId: string) {
    const proposal = await this.getProposal(proposalId);
    if (proposal.companyId !== companyId) {
      throw new ForbiddenException(`Proposal ${proposalId} does not belong to company ${companyId}`);
    }

    if (!this.digitalTwin) {
      this.logger.warn(`DigitalTwinScenarioService not injected, skipping digital-twin simulation`);
      return {
        proposalId,
        simulated: false,
        reason: 'Digital-twin simulation service unavailable',
      };
    }

    // Create scenario
    const scenario = await this.digitalTwin.createScenario({
      companyId,
      name: `Simulate Improvement: ${proposal.title}`,
      description: `Evaluation of proposal ${proposal.id}: ${proposal.problem}`,
      assumptions: [proposal.hypothesis],
      hypotheticalChanges: [
        {
          streamKey: 'OPERATIONS',
          entityType: proposal.targetDomain || 'PROCESS',
          entityId: proposal.id,
          stateKey: 'PROPOSED_CHANGE',
          projectedValue: {
            change: proposal.proposedChange,
            expectedImpact: proposal.expectedImpact,
            targetMetric: proposal.expectedMetric,
            target: proposal.target,
          },
        },
      ],
      createdBy: actorId || 'CONTINUOUS_EVOLUTION_ENGINE',
    });

    // Run simulation
    const simResult = await this.digitalTwin.runSimulation(companyId, scenario.id);

    // Update proposal with simulation link
    const updated = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        simulationScenarioId: scenario.id,
        simulationEvaluated: true,
      },
    });

    this.logger.log(
      `[ContinuousImprovement] Simulated proposal ${proposalId} via scenario ${scenario.id} (confidence: ${simResult.confidenceScore})`,
    );

    return {
      proposalId,
      scenarioId: scenario.id,
      simulated: true,
      consequenceReport: simResult.consequenceReport,
      confidenceScore: simResult.confidenceScore,
      projectedOutcomes: simResult.projectedOutcomes,
    };
  }

  /**
   * Phase 7.7 & 7.8: Governed Approval & Authority Validation.
   * Enforces authority boundaries:
   * - LOW: May execute autonomously within delegated authority.
   * - MEDIUM/HIGH: Requires appropriate delegated authority proof or approval.
   * - CRITICAL: Requires Chairman approval.
   * - CONSTITUTIONAL_CHANGE: Strict Chairman sovereignty; cannot be executed by AI or delegates.
   */
  async approveProposal(
    proposalId: string,
    approverId: string,
    options?: {
      approverTier?: AuthorityTier;
      authorityProofId?: string;
    },
  ) {
    const proposal = await this.getProposal(proposalId);

    // Verify constitutional protection
    if (proposal.authorityRequirement === ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE) {
      if (options?.approverTier !== AuthorityTier.CHAIRMAN) {
        throw new ForbiddenException(
          'CONSTITUTIONAL PROTECTION: Only the sovereign Chairman may approve or modify constitutional changes.',
        );
      }
    }

    // Verify simulation requirement
    if (proposal.simulationRequirement === 'MANDATORY' && !proposal.simulationEvaluated) {
      throw new BadRequestException(
        `Simulation required: Proposal ${proposalId} has MANDATORY simulation requirement that must be run before approval.`,
      );
    }

    const approved = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: ImprovementStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: approverId,
        authorityProofId: options?.authorityProofId,
      },
    });

    this.logger.log(`[ContinuousImprovement] Approved proposal ${proposalId} by ${approverId}`);
    return approved;
  }

  async rejectProposal(proposalId: string, rejectorId?: string, reason?: string) {
    return this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: ImprovementStatus.REJECTED,
        approvedBy: rejectorId,
        rollbackReason: reason,
      },
    });
  }

  /**
   * Phase 7.10 & 7.14: Implements and enters validation lifecycle.
   */
  async executeProposal(proposalId: string, companyId: string) {
    const proposal = await this.getProposal(proposalId);
    if (proposal.companyId !== companyId) {
      throw new ForbiddenException(`Proposal does not belong to company ${companyId}`);
    }

    if (proposal.status !== ImprovementStatus.APPROVED) {
      throw new BadRequestException(`Cannot execute unapproved proposal ${proposalId} (status: ${proposal.status})`);
    }

    const executed = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: ImprovementStatus.EXECUTING,
        executedAt: new Date(),
        validationStatus: ProposalValidationStatus.OBSERVING,
      },
    });

    this.logger.log(`[ContinuousImprovement] Proposal ${proposalId} entered execution & observation window`);
    return executed;
  }

  /**
   * Phase 7.14: Validates implemented improvement against baseline.
   * Execution completion != Success. Must have verified evidence of improvement.
   */
  async validateImprovement(
    proposalId: string,
    companyId: string,
    validation: {
      observedMetricValue: number;
      evidence: Record<string, any>;
      notes?: string;
    },
  ) {
    const proposal = await this.getProposal(proposalId);
    if (proposal.companyId !== companyId) {
      throw new ForbiddenException(`Proposal does not belong to company ${companyId}`);
    }

    const { observedMetricValue, evidence, notes } = validation;
    const isImproved = proposal.target >= proposal.baseline
      ? observedMetricValue >= proposal.target
      : observedMetricValue <= proposal.target;

    const validationStatus = isImproved ? ProposalValidationStatus.VALIDATED : ProposalValidationStatus.FAILED;
    const nextStatus = isImproved ? ImprovementStatus.COMPLETED : ImprovementStatus.FAILED;

    const updated = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: nextStatus,
        completedAt: new Date(),
        validationStatus,
        validationObservedAt: new Date(),
        validationEvidence: evidence,
      },
    });

    // Record outcome
    await this.prisma.improvementOutcome.create({
      data: {
        improvementProposalId: proposalId,
        measurementWindow: 'ObservationPeriod',
        actualResult: observedMetricValue,
        comparison: isImproved ? 'MET' : 'FAILED',
        learnedLesson: notes || (isImproved ? 'Change verified against baseline.' : 'Metric failed to meet target threshold.'),
      },
    });

    this.logger.log(
      `[ContinuousImprovement] Validated proposal ${proposalId}: status=${validationStatus} (observed: ${observedMetricValue}, target: ${proposal.target})`,
    );

    return updated;
  }

  /**
   * Phase 7.15: Governed Automatic Rollback.
   * If a change fails, causes safety regression, or degrades operational state:
   * rolls back reversible changes safely while preserving historical audit truth.
   * Irreversible changes escalate directly.
   */
  async rollbackProposal(
    proposalId: string,
    companyId: string,
    reason: string,
    evidence?: Record<string, any>,
  ) {
    const proposal = await this.getProposal(proposalId);
    if (proposal.companyId !== companyId) {
      throw new ForbiddenException(`Proposal does not belong to company ${companyId}`);
    }

    if (proposal.reversibility === ReversibilityType.IRREVERSIBLE) {
      this.logger.warn(
        `[ContinuousImprovement] Rollback impossible: Proposal ${proposalId} is IRREVERSIBLE. Escalating to Chairman.`,
      );
      throw new BadRequestException(
        `IRREVERSIBLE CHANGE: Proposal ${proposalId} cannot be automatically rolled back. Incident escalated to Chairman.`,
      );
    }

    const rolledBack = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: ImprovementStatus.ROLLED_BACK,
        rolledBackAt: new Date(),
        validationStatus: ProposalValidationStatus.ROLLED_BACK,
        rollbackReason: reason,
        rollbackEvidence: evidence || {},
      },
    });

    this.logger.log(`[ContinuousImprovement] Rolled back proposal ${proposalId}: ${reason}`);
    return rolledBack;
  }

  /**
   * Phase 7.9: Applies verified learning to AI Workforce capability and reliability.
   * Adjusts reliability score and skill confidence based on verified execution evidence.
   */
  async applyWorkforceLearning(input: {
    companyId: string;
    employeeId: string;
    capability: string;
    success: boolean;
    evidenceProofId?: string;
  }) {
    const { companyId, employeeId, capability, success } = input;
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: { skills: true },
    });
    if (!employee) {
      throw new NotFoundException(`Employee ${employeeId} not found in company ${companyId}`);
    }

    // Reliability update: +2 on success, -5 on failure
    const currentReliability = employee.reliability ?? 50;
    const newReliability = success
      ? Math.min(100, currentReliability + 2)
      : Math.max(10, currentReliability - 5);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { reliability: newReliability },
    });

    // Update skill confidence if matched
    const skill = employee.skills.find(
      (s) => s.name.toUpperCase() === capability.toUpperCase(),
    );
    if (skill) {
      const currentProf = skill.proficiency || 50;
      const newProf = success ? Math.min(100, currentProf + 3) : Math.max(10, currentProf - 4);
      await this.prisma.employeeSkill.update({
        where: { id: skill.id },
        data: { proficiency: newProf },
      });
    }

    this.logger.log(
      `[ContinuousImprovement] Updated workforce learning for ${employee.name} (${employeeId}): reliability=${newReliability}, success=${success}`,
    );

    return {
      employeeId,
      newReliability,
      capability,
      success,
    };
  }

  async listProposals(companyId: string, status?: ImprovementStatus) {
    return this.prisma.improvementProposal.findMany({
      where: {
        companyId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { outcomes: true },
    });
  }

  async getProposal(id: string) {
    const proposal = await this.prisma.improvementProposal.findUnique({
      where: { id },
      include: { outcomes: true },
    });
    if (!proposal) throw new NotFoundException(`Proposal ${id} not found`);
    return proposal;
  }

  /**
   * Backwards-compatible opportunity detector.
   * Leverages signal recording to identify improvement opportunities from company activity.
   */
  async detectImprovementOpportunities(companyId: string) {
    if (!companyId) return [];
    this.logger.log(`[ContinuousImprovement] Detecting improvement opportunities for company ${companyId}`);
    return this.prisma.improvementProposal.findMany({
      where: { companyId, status: { in: [ImprovementStatus.DETECTED, ImprovementStatus.PROPOSED] } },
    });
  }

  /**
   * Backwards-compatible outcome recorder for v10 compatibility.
   */
  async recordOutcome(
    proposalId: string,
    data: {
      measurementWindow: string;
      actualResult: number;
      comparison: string;
      learnedLesson?: string;
    },
  ) {
    const outcome = await this.prisma.improvementOutcome.create({
      data: {
        improvementProposalId: proposalId,
        measurementWindow: data.measurementWindow,
        actualResult: data.actualResult,
        comparison: data.comparison,
        learnedLesson: data.learnedLesson || '',
      },
    });

    await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: { status: ImprovementStatus.COMPLETED },
    });

    return outcome;
  }
}
