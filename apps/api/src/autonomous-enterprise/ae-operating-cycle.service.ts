import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AeAuditService } from './ae-audit.service';
import { AeOperatingCycleStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class AeOperatingCycleService {
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

  async open(companyId: string, actorId: string, dto: { period: string; summary?: string }) {
    await this.verifyActor(actorId, companyId);
    try {
      const cycle = await this.prisma.aeOperatingCycle.create({
        data: {
          companyId,
          period: dto.period,
          summary: dto.summary,
          status: AeOperatingCycleStatus.OPEN,
          isAdvisory: true,
          openedBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, action: 'AE_CYCLE_OPENED', objectType: 'AeOperatingCycle', objectId: cycle.id });
      return cycle;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`Cycle for period ${dto.period} already exists`);
      throw e;
    }
  }

  async review(companyId: string, actorId: string, cycleId: string) {
    await this.verifyActor(actorId, companyId);
    const cycle = await this.get(companyId, cycleId);
    if (cycle.status !== AeOperatingCycleStatus.OPEN) throw new BadRequestException('Cycle must be OPEN to move to REVIEWING');
    const updated = await this.prisma.aeOperatingCycle.update({ where: { id: cycleId }, data: { status: AeOperatingCycleStatus.REVIEWING } });
    await this.audit.record({ companyId, actorId, action: 'AE_CYCLE_REVIEWING', objectType: 'AeOperatingCycle', objectId: cycleId });
    return updated;
  }

  async close(companyId: string, actorId: string, cycleId: string) {
    await this.verifyActor(actorId, companyId);
    const cycle = await this.get(companyId, cycleId);
    if (cycle.status !== AeOperatingCycleStatus.REVIEWING) throw new BadRequestException('Cycle must be REVIEWING to close');
    const updated = await this.prisma.aeOperatingCycle.update({
      where: { id: cycleId },
      data: { status: AeOperatingCycleStatus.CLOSED, closedBy: actorId, closedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'AE_CYCLE_CLOSED', objectType: 'AeOperatingCycle', objectId: cycleId });
    return updated;
  }

  async list(companyId: string) {
    return this.prisma.aeOperatingCycle.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async get(companyId: string, cycleId: string) {
    const cycle = await this.prisma.aeOperatingCycle.findUnique({ where: { id: cycleId } });
    if (!cycle || cycle.companyId !== companyId) throw new NotFoundException('Cycle not found');
    return cycle;
  }
}
