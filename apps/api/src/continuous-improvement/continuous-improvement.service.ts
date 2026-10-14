import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ImprovementStatus, EmergencyState } from '@prisma/client';
import {
  TargetDomain,
  ReversibilityType,
  BlastRadius,
  ProposalAuthorityRequirement,
  ProposalValidationStatus,
  CanonicalImprovementSignal,
  CreateProposalInput,
  RankedImprovementProposal,
  RankingDecisionRecord,
  RankingFactors,
  OscillationDetectionResult,
  ExecuteProposalOptions,
  GovernedImprovementCycleResult,
} from './continuous-improvement.types';
import { DigitalTwinScenarioService } from '../enterprise-intelligence/digital-twin-scenario.service';
import { GovernedAuthorityService } from '../governance/governed-authority.service';
import { AntiEntropyEngineService } from './anti-entropy-engine.service';
import { AuthorityTier } from '../governance/authority-context.types';
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

  // V23 In-memory oscillation tracking map: key = `${companyId}:${entity}`
  private readonly oscillationTracker = new Map<
    string,
    { attempts: number; failures: number; rollbacks: number; lastFailedAt: number; cooldownUntil?: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly digitalTwin?: DigitalTwinScenarioService,
    @Optional() private readonly authorityService?: GovernedAuthorityService,
    @Optional() private readonly antiEntropy?: AntiEntropyEngineService,
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
   * V23 Anti-Thrashing & Anti-Oscillation Protection:
   * Detects whether an entity or process has experienced repeated failures or rollbacks (>= 2).
   * Calculates dynamic cooldown and flags if Chairman escalation is required.
   */
  async detectOscillation(companyId: string, affectedEntity: string): Promise<OscillationDetectionResult> {
    if (!companyId || !affectedEntity) {
      return {
        isOscillating: false,
        affectedEntity: affectedEntity || 'UNKNOWN',
        failureCount: 0,
        rollbackCount: 0,
        totalAttempts: 0,
        requiresChairmanReview: false,
        reason: 'Missing companyId or affectedEntity',
      };
    }

    const key = `${companyId}:${affectedEntity}`;
    const inMemory = this.oscillationTracker.get(key);
    const now = Date.now();

    // Query historical failures and rollbacks from database
    const [failedProposals, rolledBackProposals] = await Promise.all([
      this.prisma.improvementProposal.findMany({
        where: {
          companyId,
          status: ImprovementStatus.FAILED,
          OR: [
            { problem: { contains: affectedEntity } },
            { title: { contains: affectedEntity } },
            { targetDomain: affectedEntity },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.improvementProposal.findMany({
        where: {
          companyId,
          status: ImprovementStatus.ROLLED_BACK,
          OR: [
            { problem: { contains: affectedEntity } },
            { title: { contains: affectedEntity } },
            { targetDomain: affectedEntity },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
    ]);

    const dbFailures = failedProposals.length;
    const dbRollbacks = rolledBackProposals.length;

    const failures = Math.max(dbFailures, inMemory?.failures || 0);
    const rollbacks = Math.max(dbRollbacks, inMemory?.rollbacks || 0);
    const totalNegativeEvents = failures + rollbacks;
    const totalAttempts = (inMemory?.attempts || 0) + totalNegativeEvents;

    // Oscillation threshold: >= 2 failures/rollbacks triggers anti-thrashing
    const isOscillating = totalNegativeEvents >= 2;
    const requiresChairmanReview = totalNegativeEvents >= 3;

    let cooldownUntil: Date | undefined;
    const requiredCooldownMs = totalNegativeEvents >= 3 ? 30 * 60 * 1000 : 5 * 60 * 1000;
    const minCooldownTime = (inMemory?.lastFailedAt || now) + requiredCooldownMs;

    if (inMemory?.cooldownUntil && inMemory.cooldownUntil > now) {
      const effectiveCooldown = totalNegativeEvents >= 3 && minCooldownTime > inMemory.cooldownUntil
        ? minCooldownTime
        : inMemory.cooldownUntil;
      cooldownUntil = new Date(effectiveCooldown);
      if (inMemory) {
        inMemory.cooldownUntil = effectiveCooldown;
      }
    } else if (isOscillating) {
      if (minCooldownTime > now) {
        cooldownUntil = new Date(minCooldownTime);
        if (inMemory) {
          inMemory.cooldownUntil = minCooldownTime;
        }
      }
    }

    const reason = isOscillating
      ? `Anti-thrashing triggered: Entity ${affectedEntity} has ${failures} failure(s) and ${rollbacks} rollback(s). ${
          cooldownUntil && cooldownUntil.getTime() > now
            ? `Active cooldown until ${cooldownUntil.toISOString()}.`
            : 'Immediate re-execution restricted.'
        } ${requiresChairmanReview ? 'Escalated to Chairman review.' : ''}`.trim()
      : `Entity ${affectedEntity} has normal stability (${totalNegativeEvents} negative events).`;

    return {
      isOscillating,
      affectedEntity,
      failureCount: failures,
      rollbackCount: rollbacks,
      totalAttempts,
      cooldownUntil,
      requiresChairmanReview,
      reason,
    };
  }

  recordNegativeEvent(companyId: string, entity: string, type: 'FAILURE' | 'ROLLBACK') {
    const key = `${companyId}:${entity}`;
    const current = this.oscillationTracker.get(key) || {
      attempts: 0,
      failures: 0,
      rollbacks: 0,
      lastFailedAt: Date.now(),
    };
    current.attempts += 1;
    if (type === 'FAILURE') current.failures += 1;
    if (type === 'ROLLBACK') current.rollbacks += 1;
    current.lastFailedAt = Date.now();
    const totalNeg = current.failures + current.rollbacks;
    const cooldownMs = totalNeg >= 3 ? 30 * 60 * 1000 : 5 * 60 * 1000;
    current.cooldownUntil = Date.now() + cooldownMs;
    this.oscillationTracker.set(key, current);
  }

  /**
   * Phase 7.5, 7.8, 7.20 & V23: Governed Improvement Proposal Creation.
   * Enforces:
   * - Company isolation.
   * - Emergency stop validation.
   * - Proposal storm prevention (rate limiting & deduplication).
   * - Anti-thrashing / oscillation detection and cooldown.
   * - Constitutional immutability protection: blocks autonomous modification of constitutional boundaries.
   * - Classification of authority requirement based on risk, domain, reversibility, blast radius, and oscillation.
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

    // 3.5. Anti-Thrashing & Anti-Oscillation Check
    const affectedEntity = input.targetDomain || input.title;
    const oscillation = await this.detectOscillation(companyId, affectedEntity);
    if (oscillation.isOscillating && oscillation.cooldownUntil && oscillation.cooldownUntil.getTime() > now) {
      if (input.risk !== 'CRITICAL' && input.actorId !== 'CHAIRMAN') {
        this.logger.warn(
          `[ContinuousImprovement] Proposal creation blocked by active oscillation cooldown for ${affectedEntity}`,
        );
        throw new BadRequestException(
          `Anti-thrashing cooldown active for '${affectedEntity}' until ${oscillation.cooldownUntil.toISOString()}. ${oscillation.reason}`,
        );
      }
    }

    // 4. Phase 7.8 Constitutional Immutability Protection & Authority Classification
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
    } else if (oscillation.requiresChairmanReview) {
      this.logger.warn(
        `[ContinuousImprovement] Repeated oscillation detected for ${affectedEntity}: escalating to Chairman review`,
      );
      authorityRequirement = ProposalAuthorityRequirement.CHAIRMAN_REQUIRED;
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
    const _updated = await this.prisma.improvementProposal.update({
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

    // Verify constitutional and Chairman authority protection
    if (
      proposal.authorityRequirement === ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE ||
      proposal.authorityRequirement === ProposalAuthorityRequirement.CHAIRMAN_REQUIRED
    ) {
      if (options?.approverTier !== AuthorityTier.CHAIRMAN) {
        throw new ForbiddenException(
          `SOVEREIGN CHAIRMAN PROTECTION: Only the sovereign Chairman may approve proposals requiring ${proposal.authorityRequirement}.`,
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
   * Phase 7.10, 7.14 & V23 Governed Execution:
   * Enforces:
   * - Company isolation.
   * - Execution-time EMERGENCY_STOP enforcement.
   * - Anti-thrashing / oscillation cooldown re-check.
   * - Governance authority validation and single-use proof / parameter binding.
   * - Implements and enters validation lifecycle.
   */
  async executeProposal(proposalId: string, companyId: string, options?: ExecuteProposalOptions) {
    const proposal = await this.getProposal(proposalId);
    if (proposal.companyId !== companyId) {
      throw new ForbiddenException(`Proposal does not belong to company ${companyId}`);
    }

    // 1. Re-verify Emergency Status at execution boundary (Unconditional fail-closed)
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }
    if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
      this.logger.error(
        `[ContinuousImprovement] Execution blocked: Company ${companyId} is under EMERGENCY_STOP.`,
      );
      throw new ForbiddenException(
        `Operation blocked: Company ${companyId} is under EMERGENCY_STOP. Improvement proposal execution is suspended.`,
      );
    }

    // 2. Proposal Status Check
    if (proposal.status !== ImprovementStatus.APPROVED) {
      throw new BadRequestException(`Cannot execute unapproved proposal ${proposalId} (status: ${proposal.status})`);
    }

    // 3. Re-verify Anti-Thrashing / Oscillation Cooldown
    const affectedEntity = proposal.targetDomain || proposal.title;
    const oscillation = await this.detectOscillation(companyId, affectedEntity);
    if (oscillation.isOscillating && oscillation.cooldownUntil && oscillation.cooldownUntil.getTime() > Date.now()) {
      if (options?.actorTier !== AuthorityTier.CHAIRMAN && options?.actorTier !== 'CHAIRMAN') {
        throw new BadRequestException(
          `Execution blocked by anti-thrashing cooldown for '${affectedEntity}' until ${oscillation.cooldownUntil.toISOString()}.`,
        );
      }
    }

    // 4. Governed Authority Requirement Verification
    const authorityReq = proposal.authorityRequirement;
    if (authorityReq === ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE) {
      if (options?.actorTier !== AuthorityTier.CHAIRMAN && options?.actorTier !== 'CHAIRMAN') {
        throw new ForbiddenException(
          'CONSTITUTIONAL PROTECTION: Only the sovereign Chairman may execute constitutional improvements.',
        );
      }
    } else if (authorityReq === ProposalAuthorityRequirement.CHAIRMAN_REQUIRED) {
      if (options?.actorTier && options.actorTier !== AuthorityTier.CHAIRMAN && options.actorTier !== 'CHAIRMAN') {
        throw new ForbiddenException(
          'Proposal execution requires sovereign Chairman authority.',
        );
      }
    }

    // 5. Parameter Hash Integrity Verification if provided
    if (options?.expectedParametersHash) {
      const canonicalProposalHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          title: proposal.title,
          problem: proposal.problem,
          proposedChange: proposal.proposedChange,
          baseline: proposal.baseline,
          target: proposal.target,
        }))
        .digest('hex');

      if (options.expectedParametersHash !== canonicalProposalHash) {
        throw new BadRequestException(
          `Execution parameter mismatch: expected hash does not match canonical proposal parameters`,
        );
      }
    }

    const executed = await this.prisma.improvementProposal.update({
      where: { id: proposalId },
      data: {
        status: ImprovementStatus.EXECUTING,
        executedAt: new Date(),
        validationStatus: ProposalValidationStatus.OBSERVING,
        authorityProofId: options?.authorityProofId || proposal.authorityProofId,
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

    // Track negative event for anti-oscillation
    if (!isImproved) {
      this.recordNegativeEvent(companyId, proposal.targetDomain || proposal.title, 'FAILURE');
    }

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

    // Track negative event for anti-oscillation
    this.recordNegativeEvent(companyId, proposal.targetDomain || proposal.title, 'ROLLBACK');

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

  /**
   * V23 Explainable Multi-Criteria Proposal Ranking & Decision Records:
   * Ranks candidate proposals by:
   * - Expected Benefit Score: relative gain (|target - baseline| / max(|baseline|, 1))
   * - Confidence Factor: normalized confidence (0.1 - 1.0)
   * - Risk Penalty: LOW (1.0), MEDIUM (0.8), HIGH (0.5), CRITICAL (0.2)
   * - Blast Radius Factor: LOCAL (1.0), DEPARTMENT (0.85), ENTERPRISE (0.7), CONSTITUTIONAL (0.35)
   * - Priority Weight: LOW (0.8), NORMAL (1.0), HIGH (1.3), URGENT (1.6)
   * - Cost Penalty: based on reversibility (REVERSIBLE=0.1, ESCALATION=0.3, IRREVERSIBLE=0.6)
   */
  async rankImprovementOpportunities(
    companyId: string,
    options?: { maxResults?: number },
  ): Promise<RankingDecisionRecord> {
    if (!companyId) {
      throw new BadRequestException('companyId is required for proposal ranking');
    }

    const max = options?.maxResults ?? 10;
    const candidates = await this.prisma.improvementProposal.findMany({
      where: {
        companyId,
        status: { in: [ImprovementStatus.DETECTED, ImprovementStatus.PROPOSED, ImprovementStatus.UNDER_REVIEW, ImprovementStatus.APPROVED] },
      },
      include: { outcomes: true },
      orderBy: { createdAt: 'desc' },
    });

    const rankedList: RankedImprovementProposal[] = [];

    for (const p of candidates) {
      // 1. Benefit Score: relative gain from baseline to target
      const baseline = p.baseline || 0;
      const target = p.target || 0;
      const denom = Math.max(Math.abs(baseline), 1);
      const rawBenefit = Math.abs(target - baseline) / denom;
      const benefitScore = Math.min(Math.max(rawBenefit, 0.1), 5.0); // bounded 0.1 to 5.0

      // 2. Confidence Factor
      const confidence = p.confidence ?? 50;
      const confidenceFactor = Math.min(Math.max(confidence / 100, 0.1), 1.0);

      // 3. Risk Penalty
      let riskPenalty = 0.8;
      switch (p.risk) {
        case 'LOW':
          riskPenalty = 1.0;
          break;
        case 'MEDIUM':
          riskPenalty = 0.8;
          break;
        case 'HIGH':
          riskPenalty = 0.5;
          break;
        case 'CRITICAL':
          riskPenalty = 0.2;
          break;
      }

      // 4. Blast Radius Factor
      let blastRadiusFactor = 1.0;
      switch (p.blastRadius) {
        case BlastRadius.LOCAL:
          blastRadiusFactor = 1.0;
          break;
        case BlastRadius.DEPARTMENT:
          blastRadiusFactor = 0.85;
          break;
        case BlastRadius.ENTERPRISE:
          blastRadiusFactor = 0.7;
          break;
        case BlastRadius.CONSTITUTIONAL:
          blastRadiusFactor = 0.35;
          break;
      }

      // 5. Cost Penalty based on Reversibility
      let costPenalty = 0.1;
      switch (p.reversibility) {
        case ReversibilityType.REVERSIBLE:
          costPenalty = 0.1;
          break;
        case ReversibilityType.ESCALATION_REQUIRED:
          costPenalty = 0.3;
          break;
        case ReversibilityType.IRREVERSIBLE:
          costPenalty = 0.6;
          break;
      }

      // 6. Priority Weight
      let priorityWeight = 1.0;
      switch (p.priority) {
        case 'LOW':
          priorityWeight = 0.8;
          break;
        case 'NORMAL':
          priorityWeight = 1.0;
          break;
        case 'HIGH':
          priorityWeight = 1.3;
          break;
        case 'URGENT':
          priorityWeight = 1.6;
          break;
      }

      // Composite Score Calculation
      const numerator = benefitScore * confidenceFactor * riskPenalty * blastRadiusFactor * priorityWeight;
      const denominator = 1.0 + costPenalty;
      const compositeScore = Number((numerator / denominator).toFixed(4));

      const rankReasoning =
        `Benefit (${benefitScore.toFixed(2)}) × Confidence (${confidenceFactor.toFixed(2)}) × ` +
        `Risk (${riskPenalty.toFixed(2)}) × BlastRadius (${blastRadiusFactor.toFixed(2)}) × ` +
        `Priority (${priorityWeight.toFixed(2)}) / Cost (${denominator.toFixed(2)}) = ${compositeScore}`;

      const ranking: RankingFactors = {
        benefitScore,
        confidenceFactor,
        riskPenalty,
        blastRadiusFactor,
        costPenalty,
        priorityWeight,
        compositeScore,
      };

      rankedList.push({
        proposal: p,
        ranking,
        rankReasoning,
      });
    }

    // Sort descending by compositeScore
    rankedList.sort((a, b) => b.ranking.compositeScore - a.ranking.compositeScore);

    const topRanked = rankedList.slice(0, max);
    const summary =
      topRanked.length > 0
        ? `Ranked ${rankedList.length} candidate proposal(s). Top proposal: '${topRanked[0].proposal.title}' (score: ${topRanked[0].ranking.compositeScore}).`
        : 'No candidate improvement proposals found to rank.';

    this.logger.log(`[ContinuousImprovement] Company ${companyId} - ${summary}`);

    return {
      companyId,
      evaluatedAt: new Date(),
      candidateCount: rankedList.length,
      rankedProposals: topRanked,
      summary,
    };
  }

  /**
   * V23 Canonical Governed Self-Improvement Lifecycle:
   * Observe → Evaluate & Rank → Propose → Simulate (when appropriate) → Authorize → Execute → Verify → Learn → Reconcile
   */
  async runGovernedSelfImprovementCycle(
    companyId: string,
    actorId: string,
    options?: {
      autoExecuteIfAuthorized?: boolean;
      targetProposalId?: string;
      simulatedMetricResult?: number;
    },
  ): Promise<GovernedImprovementCycleResult> {
    const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date();

    if (!companyId) {
      throw new BadRequestException('companyId is required for self-improvement cycle');
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    if (company.emergencyStatus === EmergencyState.EMERGENCY_STOP) {
      return {
        cycleId,
        companyId,
        timestamp,
        status: 'HALTED',
        stages: {
          observe: { signalsObserved: 0 },
          evaluate: { candidateCount: 0 },
          rank: {},
        },
        reason: 'Company is in EMERGENCY_STOP. All autonomous self-improvement cycles halted.',
      };
    }

    // 1. OBSERVE: Gather signals & candidate proposals
    const detectedOpportunities = await this.detectImprovementOpportunities(companyId);

    // 2. EVALUATE & RANK
    const rankingRecord = await this.rankImprovementOpportunities(companyId);
    const topRanked = rankingRecord.rankedProposals[0];

    if (!topRanked && !options?.targetProposalId) {
      return {
        cycleId,
        companyId,
        timestamp,
        status: 'COMPLETED',
        stages: {
          observe: { signalsObserved: detectedOpportunities.length },
          evaluate: { candidateCount: 0 },
          rank: {},
        },
        reason: 'No candidate proposals requiring improvement actions.',
      };
    }

    const targetProposal = options?.targetProposalId
      ? await this.getProposal(options.targetProposalId)
      : topRanked.proposal;

    const result: GovernedImprovementCycleResult = {
      cycleId,
      companyId,
      timestamp,
      status: 'COMPLETED',
      stages: {
        observe: { signalsObserved: detectedOpportunities.length },
        evaluate: { candidateCount: rankingRecord.candidateCount, topProposalId: targetProposal.id },
        rank: { topRanked },
      },
    };

    // 3. SIMULATE (when required or recommended)
    if (targetProposal.simulationRequirement === 'MANDATORY' || targetProposal.simulationRequirement === 'RECOMMENDED') {
      try {
        const sim = await this.simulateProposal(companyId, targetProposal.id, actorId);
        result.stages.simulate = {
          simulated: sim.simulated,
          scenarioId: sim.scenarioId,
          confidenceScore: sim.confidenceScore,
        };
      } catch (err: any) {
        this.logger.warn(`Simulation failed during cycle ${cycleId}: ${err.message}`);
        result.stages.simulate = { simulated: false };
      }
    }

    // 4. AUTHORIZE
    const authorityReq = targetProposal.authorityRequirement;
    const isChairmanRequired =
      authorityReq === ProposalAuthorityRequirement.CHAIRMAN_REQUIRED ||
      authorityReq === ProposalAuthorityRequirement.CONSTITUTIONAL_CHANGE;

    result.stages.authorize = {
      authorized: targetProposal.status === ImprovementStatus.APPROVED,
      proofId: targetProposal.authorityProofId || undefined,
      requirement: authorityReq,
    };

    if (isChairmanRequired && targetProposal.status !== ImprovementStatus.APPROVED) {
      result.status = 'ESCALATED_TO_CHAIRMAN';
      result.reason = `Proposal '${targetProposal.title}' requires sovereign Chairman approval before execution.`;
      return result;
    }

    // 5. EXECUTE (if authorized and autoExecute requested)
    if (options?.autoExecuteIfAuthorized && targetProposal.status === ImprovementStatus.APPROVED) {
      try {
        const executed = await this.executeProposal(targetProposal.id, companyId, { actorId });
        result.stages.execute = { executed: true, status: executed.status };

        // 6. VERIFY (if test metric provided)
        if (options?.simulatedMetricResult !== undefined) {
          const validation = await this.validateImprovement(targetProposal.id, companyId, {
            observedMetricValue: options.simulatedMetricResult,
            evidence: { cycleId, verifiedAt: new Date() },
            notes: `Verified during self-improvement cycle ${cycleId}`,
          });

          const isVerified = validation.validationStatus === ProposalValidationStatus.VALIDATED;
          result.stages.verify = {
            verified: isVerified,
            validationStatus: validation.validationStatus || undefined,
            learnedLesson: `Metric ${options.simulatedMetricResult} vs target ${targetProposal.target}`,
          };

          if (!isVerified) {
            result.status = 'HALTED';
            result.reason = `Outcome verification failed: observed metric ${options.simulatedMetricResult} did not meet target ${targetProposal.target}.`;
            return result;
          }

          // 7. LEARN
          if (targetProposal.targetDomain === TargetDomain.WORKFORCE_ASSIGNMENT && actorId) {
            try {
              const learn = await this.applyWorkforceLearning({
                companyId,
                employeeId: actorId,
                capability: 'SELF_IMPROVEMENT',
                success: true,
              });
              result.stages.learn = {
                workforceUpdated: true,
                employeeId: actorId,
                newReliability: learn.newReliability,
              };
            } catch (e: any) {
              result.stages.learn = { workforceUpdated: false };
            }
          }
        } else {
          // Execution completed but observation window is ongoing; do not falsely claim COMPLETED before verification
          result.status = 'OBSERVING';
          result.reason = `Proposal '${targetProposal.title}' executed; outcome verification window in progress.`;
        }
      } catch (err: any) {
        result.status = 'HALTED';
        result.reason = `Execution halted: ${err.message}`;
        result.stages.execute = { executed: false, status: 'FAILED' };
        return result;
      }
    }

    // 8. RECONCILE (Anti-Entropy scan)
    if (this.antiEntropy) {
      try {
        const findings = await this.antiEntropy.runAudit(companyId);
        result.stages.reconcile = { entropyFindingsCount: findings.length };
      } catch (err: any) {
        this.logger.warn(`Anti-entropy audit skipped during cycle ${cycleId}: ${err.message}`);
      }
    }

    return result;
  }
}
