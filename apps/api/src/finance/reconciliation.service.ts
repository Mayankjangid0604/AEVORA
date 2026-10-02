import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuditService } from './financial-audit.service';
import { ReconciliationStatus } from '@prisma/client';

@Injectable()
export class ReconciliationService {
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

  async createReconciliation(companyId: string, actorId: string, dto: {
    accountId?: string; period: string; observedRef?: string;
    observedAmount: number; ledgerAmount: number; notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.observedAmount)) throw new BadRequestException('observedAmount must be integer');
    if (!Number.isInteger(dto.ledgerAmount)) throw new BadRequestException('ledgerAmount must be integer');

    if (dto.accountId) {
      const acct = await this.prisma.financialAccount.findUnique({ where: { id: dto.accountId } });
      if (!acct || acct.companyId !== companyId) throw new NotFoundException('Account not found');
    }

    const variance = dto.observedAmount - dto.ledgerAmount;
    const status: ReconciliationStatus = variance === 0
      ? ReconciliationStatus.MATCHED
      : ReconciliationStatus.DISCREPANCY;

    const rec = await this.prisma.financialReconciliation.create({
      data: {
        companyId, accountId: dto.accountId, period: dto.period,
        observedRef: dto.observedRef, observedAmount: dto.observedAmount,
        ledgerAmount: dto.ledgerAmount, variance, status, notes: dto.notes,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'RECONCILIATION_CREATED',
      objectType: 'FinancialReconciliation', objectId: rec.id,
      newValue: { period: dto.period, variance, status },
    });
    return rec;
  }

  async resolveReconciliation(companyId: string, actorId: string, recId: string, notes: string) {
    await this.verifyActor(actorId, companyId);
    const rec = await this.prisma.financialReconciliation.findUnique({ where: { id: recId } });
    if (!rec || rec.companyId !== companyId) throw new NotFoundException('Reconciliation not found');
    if (rec.status === ReconciliationStatus.RESOLVED) throw new BadRequestException('Already resolved');

    const updated = await this.prisma.financialReconciliation.update({
      where: { id: recId },
      data: { status: ReconciliationStatus.RESOLVED, resolvedById: actorId, resolvedAt: new Date(), notes },
    });
    await this.audit.record({
      companyId, actorId, action: 'RECONCILIATION_RESOLVED',
      objectType: 'FinancialReconciliation', objectId: recId,
      oldValue: { status: rec.status }, newValue: { status: 'RESOLVED' },
    });
    return updated;
  }

  async getReconciliations(companyId: string, status?: ReconciliationStatus) {
    return this.prisma.financialReconciliation.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
