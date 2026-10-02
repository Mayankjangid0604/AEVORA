import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { EmployeeStatus, EscalationStatus, DecisionPriority, RiskLevel } from '@prisma/client';

@Injectable()
export class EscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createEscalation(companyId: string, actorId: string, dto: {
    title: string;
    description?: string;
    reason: string;
    evidence?: unknown[];
    proposedAction?: unknown;
    expectedImpact?: unknown;
    riskLevel?: RiskLevel;
    priority?: DecisionPriority;
    escalatedTo?: string;
    deadline?: string;
    decisionId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    // Priority CRITICAL requires justification
    if (dto.priority === DecisionPriority.CRITICAL && (!dto.reason || dto.reason.trim().length < 10)) {
      throw new BadRequestException('CRITICAL escalation requires detailed reason (min 10 chars)');
    }

    const esc = await this.prisma.escalationRecord.create({
      data: {
        companyId,
        decisionId: dto.decisionId,
        title: dto.title,
        description: dto.description,
        reason: dto.reason,
        evidence: (dto.evidence ?? []) as any,
        proposedAction: (dto.proposedAction ?? {}) as any,
        expectedImpact: (dto.expectedImpact ?? {}) as any,
        riskLevel: dto.riskLevel ?? RiskLevel.MEDIUM,
        priority: dto.priority ?? DecisionPriority.NORMAL,
        escalatedBy: actorId,
        escalatedTo: dto.escalatedTo ?? 'CHAIRMAN',
        status: EscalationStatus.PENDING,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'ESCALATION_CREATED', objectType: 'EscalationRecord', objectId: esc.id, newValue: { title: esc.title, priority: esc.priority, escalatedTo: esc.escalatedTo } });
    return esc;
  }

  async acknowledgeEscalation(companyId: string, actorId: string, escalationId: string) {
    await this.verifyActor(actorId, companyId);
    const esc = await this.prisma.escalationRecord.findUnique({ where: { id: escalationId } });
    if (!esc || esc.companyId !== companyId) throw new NotFoundException('Escalation not found');
    if (esc.status !== EscalationStatus.PENDING) throw new BadRequestException('Only PENDING escalations can be acknowledged');

    const updated = await this.prisma.escalationRecord.update({
      where: { id: escalationId },
      data: { status: EscalationStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'ESCALATION_ACKNOWLEDGED', objectType: 'EscalationRecord', objectId: escalationId });
    return updated;
  }

  async resolveEscalation(companyId: string, actorId: string, escalationId: string, resolutionNote: string) {
    await this.verifyActor(actorId, companyId);
    const esc = await this.prisma.escalationRecord.findUnique({ where: { id: escalationId } });
    if (!esc || esc.companyId !== companyId) throw new NotFoundException('Escalation not found');
    if (esc.status === EscalationStatus.RESOLVED || esc.status === EscalationStatus.DISMISSED) {
      throw new BadRequestException('Escalation is already resolved/dismissed');
    }

    // The escalating actor cannot self-resolve unless another actor has acknowledged
    if (esc.escalatedBy === actorId && esc.status === EscalationStatus.PENDING) {
      throw new ForbiddenException('Escalator cannot self-resolve a pending escalation');
    }

    const updated = await this.prisma.escalationRecord.update({
      where: { id: escalationId },
      data: { status: EscalationStatus.RESOLVED, resolvedBy: actorId, resolutionNote, resolvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'ESCALATION_RESOLVED', objectType: 'EscalationRecord', objectId: escalationId, newValue: { resolutionNote } });
    return updated;
  }

  async dismissEscalation(companyId: string, actorId: string, escalationId: string, note: string) {
    await this.verifyActor(actorId, companyId);
    const esc = await this.prisma.escalationRecord.findUnique({ where: { id: escalationId } });
    if (!esc || esc.companyId !== companyId) throw new NotFoundException('Escalation not found');
    if (esc.status === EscalationStatus.RESOLVED || esc.status === EscalationStatus.DISMISSED) {
      throw new BadRequestException('Escalation is already in terminal status');
    }

    // Escalating actor cannot dismiss their own escalation while PENDING
    if (esc.escalatedBy === actorId && esc.status === EscalationStatus.PENDING) {
      throw new ForbiddenException('Escalator cannot dismiss their own pending escalation');
    }

    const updated = await this.prisma.escalationRecord.update({
      where: { id: escalationId },
      data: { status: EscalationStatus.DISMISSED, resolvedBy: actorId, resolutionNote: note, resolvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'ESCALATION_DISMISSED', objectType: 'EscalationRecord', objectId: escalationId, newValue: { note } });
    return updated;
  }

  async getPendingEscalations(companyId: string) {
    return this.prisma.escalationRecord.findMany({
      where: { companyId, status: EscalationStatus.PENDING },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getEscalations(companyId: string, status?: EscalationStatus) {
    return this.prisma.escalationRecord.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getEscalation(companyId: string, escalationId: string) {
    const esc = await this.prisma.escalationRecord.findUnique({ where: { id: escalationId } });
    if (!esc || esc.companyId !== companyId) throw new NotFoundException('Escalation not found');
    return esc;
  }
}
