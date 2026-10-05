import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeAuditService } from './ae-audit.service';
import { AeDecisionStatus, AeEscalationLevel, EmployeeStatus } from '@prisma/client';

@Injectable()
export class AeEscalationService {
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

  async raise(companyId: string, actorId: string, dto: {
    title: string; description?: string; level?: AeEscalationLevel;
    cycleId?: string; domainRef?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.cycleId) {
      const cycle = await this.prisma.aeOperatingCycle.findUnique({ where: { id: dto.cycleId } });
      if (!cycle || cycle.companyId !== companyId) throw new ForbiddenException('Cycle not in company');
    }
    const esc = await this.prisma.aeEscalation.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        level: dto.level ?? AeEscalationLevel.INFO,
        cycleId: dto.cycleId,
        domainRef: dto.domainRef,
        raisedBy: actorId,
        isAdvisory: true,
        status: AeDecisionStatus.PENDING,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_ESCALATION_RAISED', objectType: 'AeEscalation', objectId: esc.id });
    return esc;
  }

  async resolve(companyId: string, actorId: string, escalationId: string) {
    await this.verifyActor(actorId, companyId);
    const esc = await this.getEsc(companyId, escalationId);
    if (esc.status === AeDecisionStatus.ACTIONED) throw new BadRequestException('Escalation already resolved');
    const updated = await this.prisma.aeEscalation.update({
      where: { id: escalationId },
      data: { status: AeDecisionStatus.ACTIONED, resolvedBy: actorId, resolvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_ESCALATION_RESOLVED', objectType: 'AeEscalation', objectId: escalationId });
    return updated;
  }

  async defer(companyId: string, actorId: string, escalationId: string) {
    await this.verifyActor(actorId, companyId);
    await this.getEsc(companyId, escalationId);
    const updated = await this.prisma.aeEscalation.update({
      where: { id: escalationId },
      data: { status: AeDecisionStatus.DEFERRED },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_ESCALATION_DEFERRED', objectType: 'AeEscalation', objectId: escalationId });
    return updated;
  }

  async list(companyId: string, cycleId?: string, level?: AeEscalationLevel) {
    return this.prisma.aeEscalation.findMany({
      where: {
        companyId,
        ...(cycleId ? { cycleId } : {}),
        ...(level ? { level } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getEsc(companyId: string, escalationId: string) {
    const esc = await this.prisma.aeEscalation.findUnique({ where: { id: escalationId } });
    if (!esc || esc.companyId !== companyId) throw new NotFoundException('Escalation not found');
    return esc;
  }
}
