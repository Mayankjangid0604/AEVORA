import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeAuditService } from './ae-audit.service';
import { AeDecisionStatus, EmployeeStatus } from '@prisma/client';

function guardPriority(priority: any) {
  if (priority === undefined) return;
  if (!Number.isInteger(priority) || priority < 0 || priority > 100) {
    throw new BadRequestException('priority must be an integer 0-100');
  }
}

@Injectable()
export class AeDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AeAuditService,
  ) {}

  async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    title: string; description?: string; priority?: number;
    escalationId?: string; domainRefs?: any; idempotencyKey: string;
  }) {
    await this.verifyActor(actorId, companyId);
    guardPriority(dto.priority);
    // Idempotency: if key exists for this company, return existing
    const existing = await this.prisma.aeChairmanDecision.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
      return existing;
    }
    try {
      const dec = await this.prisma.aeChairmanDecision.create({
        data: {
          companyId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 50,
          escalationId: dto.escalationId,
          domainRefs: dto.domainRefs,
          idempotencyKey: dto.idempotencyKey,
          isAdvisory: false,
          status: AeDecisionStatus.PENDING,
          createdBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, action: 'AE_DECISION_CREATED', objectType: 'AeChairmanDecision', objectId: dec.id });
      return dec;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const found = await this.prisma.aeChairmanDecision.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (found) return found;
      }
      throw e;
    }
  }

  async decide(companyId: string, actorId: string, decisionId: string, notes?: string) {
    await this.verifyActor(actorId, companyId);
    const dec = await this.get(companyId, decisionId);
    if (dec.status === AeDecisionStatus.DISMISSED) throw new BadRequestException('Cannot decide a DISMISSED decision');
    if (dec.status === AeDecisionStatus.ACTIONED) throw new BadRequestException('Decision already ACTIONED');
    const updated = await this.prisma.aeChairmanDecision.update({
      where: { id: decisionId },
      data: { status: AeDecisionStatus.ACTIONED, decidedBy: actorId, decidedAt: new Date(), notes },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_DECISION_DECIDED', objectType: 'AeChairmanDecision', objectId: decisionId });
    return updated;
  }

  async defer(companyId: string, actorId: string, decisionId: string) {
    await this.verifyActor(actorId, companyId);
    await this.get(companyId, decisionId);
    const updated = await this.prisma.aeChairmanDecision.update({
      where: { id: decisionId },
      data: { status: AeDecisionStatus.DEFERRED },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_DECISION_DEFERRED', objectType: 'AeChairmanDecision', objectId: decisionId });
    return updated;
  }

  async dismiss(companyId: string, actorId: string, decisionId: string) {
    await this.verifyActor(actorId, companyId);
    await this.get(companyId, decisionId);
    const updated = await this.prisma.aeChairmanDecision.update({
      where: { id: decisionId },
      data: { status: AeDecisionStatus.DISMISSED },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_DECISION_DISMISSED', objectType: 'AeChairmanDecision', objectId: decisionId });
    return updated;
  }

  async list(companyId: string, status?: AeDecisionStatus) {
    return this.prisma.aeChairmanDecision.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, decisionId: string) {
    const dec = await this.prisma.aeChairmanDecision.findUnique({ where: { id: decisionId } });
    if (!dec || dec.companyId !== companyId) throw new NotFoundException('Decision not found');
    return dec;
  }
}
