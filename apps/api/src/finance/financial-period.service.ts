import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { FinancialPeriodStatus } from '@prisma/client';

@Injectable()
export class FinancialPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FinancialAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async openPeriod(companyId: string, actorId: string, dto: {
    name: string; startDate: Date; endDate: Date;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.endDate <= dto.startDate) throw new BadRequestException('endDate must be after startDate');

    const period = await this.prisma.financialPeriod.create({
      data: {
        companyId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: FinancialPeriodStatus.OPEN,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERIOD_OPENED',
      objectType: 'FinancialPeriod', objectId: period.id,
      newValue: { name: dto.name, startDate: dto.startDate, endDate: dto.endDate },
    });
    return period;
  }

  async closePeriod(companyId: string, actorId: string, periodId: string) {
    await this.verifyActor(actorId, companyId);
    const period = await this.prisma.financialPeriod.findUnique({ where: { id: periodId } });
    if (!period || period.companyId !== companyId) throw new NotFoundException('Period not found');
    if (period.status !== FinancialPeriodStatus.OPEN) throw new BadRequestException('Period is not OPEN');

    // Reject if any DRAFT journal entries exist in this period
    const drafts = await this.prisma.journalEntry.count({
      where: { periodId, status: 'DRAFT' },
    });
    if (drafts > 0) throw new BadRequestException(`Cannot close period: ${drafts} DRAFT journal entries exist`);

    const updated = await this.prisma.financialPeriod.update({
      where: { id: periodId },
      data: { status: FinancialPeriodStatus.CLOSED, closedById: actorId, closedAt: new Date() },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERIOD_CLOSED',
      objectType: 'FinancialPeriod', objectId: periodId,
      oldValue: { status: 'OPEN' }, newValue: { status: 'CLOSED' },
    });
    return updated;
  }

  async lockPeriod(companyId: string, actorId: string, periodId: string) {
    await this.verifyActor(actorId, companyId);
    const period = await this.prisma.financialPeriod.findUnique({ where: { id: periodId } });
    if (!period || period.companyId !== companyId) throw new NotFoundException('Period not found');
    if (period.status !== FinancialPeriodStatus.CLOSED) throw new BadRequestException('Period must be CLOSED before locking');

    const updated = await this.prisma.financialPeriod.update({
      where: { id: periodId },
      data: { status: FinancialPeriodStatus.LOCKED },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERIOD_LOCKED',
      objectType: 'FinancialPeriod', objectId: periodId,
      oldValue: { status: 'CLOSED' }, newValue: { status: 'LOCKED' },
    });
    return updated;
  }

  async getPeriods(companyId: string, status?: FinancialPeriodStatus) {
    return this.prisma.financialPeriod.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { startDate: 'desc' },
    });
  }

  async getPeriod(companyId: string, periodId: string) {
    const p = await this.prisma.financialPeriod.findUnique({ where: { id: periodId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Period not found');
    return p;
  }
}
