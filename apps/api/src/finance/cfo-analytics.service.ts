import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CfoAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const chairman = await this.prisma.chairman.findUnique({ where: { id: actorId } });
    if (chairman) return null; // chairman always allowed
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async getCashPosition(companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);
    const acct = await this.prisma.realMoneyAccount.findUnique({ where: { companyId } });
    return {
      balancePaise: acct?.balance ?? 0,
      currency: 'INR',
      asOf: new Date(),
      isAdvisory: false, // cash position is from authoritative ledger
    };
  }

  async getBurnRate(companyId: string, actorId: string, periodMonths: number = 3) {
    await this.verifyActor(actorId, companyId);
    const since = new Date();
    since.setMonth(since.getMonth() - periodMonths);

    // Sum of executed payment requests (outflows)
    const outflowAgg = await this.prisma.financePaymentRequest.aggregate({
      where: { companyId, status: 'EXECUTED', executedAt: { gte: since } },
      _sum: { amount: true },
    });
    const totalOutflow = outflowAgg._sum.amount ?? 0;
    const monthlyBurnRate = Math.round(totalOutflow / periodMonths);

    return {
      periodMonths,
      totalOutflowPaise: totalOutflow,
      monthlyBurnRatePaise: monthlyBurnRate,
      currency: 'INR',
      isAdvisory: true,
      disclaimer: 'ADVISORY ONLY — based on executed payment requests',
    };
  }

  async getRunway(companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);
    const cashPos = await this.getCashPosition(companyId, actorId);
    const burnRate = await this.getBurnRate(companyId, actorId);

    const runwayMonths = burnRate.monthlyBurnRatePaise > 0
      ? cashPos.balancePaise / burnRate.monthlyBurnRatePaise
      : null;

    return {
      cashBalancePaise: cashPos.balancePaise,
      monthlyBurnRatePaise: burnRate.monthlyBurnRatePaise,
      estimatedRunwayMonths: runwayMonths !== null ? Math.floor(runwayMonths) : null,
      currency: 'INR',
      isAdvisory: true,
      disclaimer: 'ADVISORY ONLY — AI estimate, not authoritative financial data',
    };
  }

  async getPayablesAgeing(companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);
    const now = new Date();
    const bills = await this.prisma.bill.findMany({
      where: { companyId, status: { notIn: ['PAID', 'CANCELLED', 'VOID'] } },
    });

    const buckets = { current: 0, overdue30: 0, overdue60: 0, overdue90plus: 0 };
    for (const bill of bills) {
      const daysOverdue = Math.floor((now.getTime() - bill.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 0) buckets.current += bill.total;
      else if (daysOverdue <= 30) buckets.overdue30 += bill.total;
      else if (daysOverdue <= 60) buckets.overdue60 += bill.total;
      else buckets.overdue90plus += bill.total;
    }

    return { ...buckets, currency: 'INR', billCount: bills.length };
  }

  async getProfitLossSummary(companyId: string, actorId: string, period: string) {
    await this.verifyActor(actorId, companyId);

    // Sum journal lines for REVENUE and EXPENSE accounts in POSTED entries for the period
    const revenueAccts = await this.prisma.financialAccount.findMany({
      where: { companyId, type: 'REVENUE', isActive: true },
      select: { id: true },
    });
    const expenseAccts = await this.prisma.financialAccount.findMany({
      where: { companyId, type: 'EXPENSE', isActive: true },
      select: { id: true },
    });

    const revenueIds = revenueAccts.map(a => a.id);
    const expenseIds = expenseAccts.map(a => a.id);

    const periodRec = await this.prisma.financialPeriod.findFirst({
      where: { companyId, name: period },
    });

    const revenueAgg = periodRec ? await this.prisma.journalLine.aggregate({
      where: { accountId: { in: revenueIds }, entry: { periodId: periodRec.id, status: 'POSTED' } },
      _sum: { credit: true, debit: true },
    }) : { _sum: { credit: 0, debit: 0 } };

    const expenseAgg = periodRec ? await this.prisma.journalLine.aggregate({
      where: { accountId: { in: expenseIds }, entry: { periodId: periodRec.id, status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    }) : { _sum: { debit: 0, credit: 0 } };

    const totalRevenue = (revenueAgg._sum.credit ?? 0) - (revenueAgg._sum.debit ?? 0);
    const totalExpense = (expenseAgg._sum.debit ?? 0) - (expenseAgg._sum.credit ?? 0);
    const netIncome = totalRevenue - totalExpense;

    return {
      period,
      totalRevenuePaise: totalRevenue,
      totalExpensePaise: totalExpense,
      netIncomePaise: netIncome,
      currency: 'INR',
    };
  }
}
