import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import {
  EmployeeStatus, ExecutiveDecisionStatus, ExecutiveDecisionType,
  DecisionPriority, RiskLevel, ExecutionEnvironment,
} from '@prisma/client';

// These statuses are terminal — no further transitions
const TERMINAL_STATUSES = new Set<ExecutiveDecisionStatus>([
  ExecutiveDecisionStatus.COMPLETED,
  ExecutiveDecisionStatus.FAILED,
  ExecutiveDecisionStatus.CANCELLED,
  ExecutiveDecisionStatus.REJECTED,
]);

const ALLOWED_TRANSITIONS: Record<ExecutiveDecisionStatus, ExecutiveDecisionStatus[]> = {
  PROPOSED: [ExecutiveDecisionStatus.REVIEW, ExecutiveDecisionStatus.CANCELLED],
  REVIEW: [ExecutiveDecisionStatus.APPROVAL_REQUIRED, ExecutiveDecisionStatus.APPROVED, ExecutiveDecisionStatus.REJECTED, ExecutiveDecisionStatus.CANCELLED],
  APPROVAL_REQUIRED: [ExecutiveDecisionStatus.APPROVED, ExecutiveDecisionStatus.REJECTED, ExecutiveDecisionStatus.CANCELLED],
  APPROVED: [ExecutiveDecisionStatus.EXECUTING, ExecutiveDecisionStatus.CANCELLED],
  REJECTED: [],
  EXECUTING: [ExecutiveDecisionStatus.COMPLETED, ExecutiveDecisionStatus.FAILED],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

@Injectable()
export class ExecutiveDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
    private readonly approvalSvc: ApprovalValidationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async proposeDecision(companyId: string, actorId: string, dto: {
    decisionType: ExecutiveDecisionType;
    subject: string;
    description?: string;
    evidence?: unknown[];
    analysis?: unknown;
    recommendation?: unknown;
    alternatives?: unknown[];
    expectedImpact?: unknown;
    riskLevel?: RiskLevel;
    priority?: DecisionPriority;
    requiredApproval?: boolean;
    cycleId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const decision = await this.prisma.executiveDecision.create({
      data: {
        companyId,
        proposerId: actorId,
        decisionType: dto.decisionType,
        subject: dto.subject,
        description: dto.description,
        artifactType: 'RECOMMENDATION',
        evidence: (dto.evidence ?? []) as any,
        analysis: (dto.analysis ?? {}) as any,
        recommendation: (dto.recommendation ?? {}) as any,
        alternatives: (dto.alternatives ?? []) as any,
        expectedImpact: (dto.expectedImpact ?? {}) as any,
        riskLevel: dto.riskLevel ?? RiskLevel.LOW,
        priority: dto.priority ?? DecisionPriority.NORMAL,
        requiredApproval: dto.requiredApproval ?? false,
        status: ExecutiveDecisionStatus.PROPOSED,
        cycleId: dto.cycleId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'EXECUTIVE_DECISION_PROPOSED', objectType: 'ExecutiveDecision', objectId: decision.id, newValue: { decisionType: decision.decisionType, subject: decision.subject } });
    return decision;
  }

  async advanceStatus(companyId: string, actorId: string, decisionId: string, newStatus: ExecutiveDecisionStatus, opts?: { note?: string; approvalId?: string; result?: unknown }) {
    await this.verifyActor(actorId, companyId);

    const decision = await this.prisma.executiveDecision.findUnique({ where: { id: decisionId } });
    if (!decision || decision.companyId !== companyId) throw new NotFoundException('Decision not found');

    if (TERMINAL_STATUSES.has(decision.status)) throw new BadRequestException(`Decision is in terminal status: ${decision.status}`);

    const allowed = ALLOWED_TRANSITIONS[decision.status] ?? [];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition from ${decision.status} to ${newStatus}`);

    // Self-approval prevention: proposer cannot advance from APPROVAL_REQUIRED to APPROVED
    if (newStatus === ExecutiveDecisionStatus.APPROVED && decision.proposerId === actorId) {
      throw new ForbiddenException('Proposer cannot approve their own decision');
    }

    // Approval required
    if (newStatus === ExecutiveDecisionStatus.APPROVED && decision.requiredApproval) {
      if (!opts?.approvalId) throw new BadRequestException('approvalId required for approved decision requiring approval');
      await this.approvalSvc.validateAndConsumeApproval(opts.approvalId, {
        companyId,
        action: 'APPROVE_EXECUTIVE_DECISION',
        environment: ExecutionEnvironment.PRODUCTION,
        targetType: 'ExecutiveDecision',
        targetId: decisionId,
        params: { decisionId, decisionType: decision.decisionType },
      });
    }

    const now = new Date();
    const updated = await this.prisma.executiveDecision.update({
      where: { id: decisionId },
      data: {
        status: newStatus,
        ...(newStatus === ExecutiveDecisionStatus.APPROVED ? { decisionMakerId: actorId, approvedAt: now, approvalId: opts?.approvalId, artifactType: 'DECISION' } : {}),
        ...(newStatus === ExecutiveDecisionStatus.EXECUTING ? { executedAt: now, artifactType: 'EXECUTION' } : {}),
        ...(newStatus === ExecutiveDecisionStatus.COMPLETED ? { completedAt: now, result: (opts?.result ?? {}) as any } : {}),
        ...(newStatus === ExecutiveDecisionStatus.FAILED ? { completedAt: now, result: (opts?.result ?? {}) as any } : {}),
      },
    });

    await this.audit.record({ companyId, actorId, action: 'EXECUTIVE_DECISION_STATUS_CHANGED', objectType: 'ExecutiveDecision', objectId: decisionId, oldValue: { status: decision.status }, newValue: { status: newStatus } });
    return updated;
  }

  async updatePriority(companyId: string, actorId: string, decisionId: string, priority: DecisionPriority, reason: string) {
    await this.verifyActor(actorId, companyId);
    if (!reason || reason.trim().length < 5) throw new BadRequestException('Priority change reason required (min 5 chars)');

    const decision = await this.prisma.executiveDecision.findUnique({ where: { id: decisionId } });
    if (!decision || decision.companyId !== companyId) throw new NotFoundException('Decision not found');
    if (TERMINAL_STATUSES.has(decision.status)) throw new BadRequestException('Cannot update priority on terminal decision');

    const updated = await this.prisma.executiveDecision.update({ where: { id: decisionId }, data: { priority } });
    await this.audit.record({ companyId, actorId, action: 'DECISION_PRIORITY_CHANGED', objectType: 'ExecutiveDecision', objectId: decisionId, oldValue: { priority: decision.priority }, newValue: { priority, reason } });
    return updated;
  }

  async getDecisions(companyId: string, status?: ExecutiveDecisionStatus, priority?: DecisionPriority) {
    return this.prisma.executiveDecision.findMany({
      where: { companyId, ...(status ? { status } : {}), ...(priority ? { priority } : {}) },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getDecision(companyId: string, decisionId: string) {
    const d = await this.prisma.executiveDecision.findUnique({ where: { id: decisionId } });
    if (!d || d.companyId !== companyId) throw new NotFoundException('Decision not found');
    return d;
  }
}
