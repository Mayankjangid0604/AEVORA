import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectEconomicsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectEconomics(projectId: string, companyId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        Invoice: { where: { companyId } },
        revenueRecords: { where: { companyId } },
        projectCosts: { where: { companyId } },
        assignments: { where: { status: 'ACTIVE' } },
      },
    });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }

    const contractedValue = project.quotedPrice ?? 0;
    const invoicedAmount = project.Invoice.reduce((s, inv) => s + inv.total, 0);
    const paidAmount = project.revenueRecords
      .filter(r => r.status === 'RECEIVED')
      .reduce((s, r) => s + r.amount, 0);
    const outstandingAmount = invoicedAmount - paidAmount;

    const estimatedCost = project.estimatedCost ?? 0;
    const actualCost = project.projectCosts
      .filter(c => c.status === 'PAID' || c.status === 'COMMITTED')
      .reduce((s, c) => s + c.amount, 0);

    const projectedMargin = contractedValue > 0
      ? Math.round(((contractedValue - estimatedCost) / contractedValue) * 100)
      : 0;
    const realizedMargin = paidAmount > 0
      ? Math.round(((paidAmount - actualCost) / paidAmount) * 100)
      : null;

    return {
      projectId,
      contractedValue,
      invoicedAmount,
      paidAmount,
      outstandingAmount,
      estimatedCost,
      actualCost,
      projectedMargin,
      realizedMargin,
      note: 'Revenue figures derived from authoritative PaymentEvent-backed records only',
    };
  }

  async getCustomerProfitability(clientId: string, companyId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }

    // Revenue from authoritative payment-backed records only
    const revenueRecords = await this.prisma.revenueRecord.findMany({
      where: { companyId, project: { clientId } },
    });

    const totalRevenue = revenueRecords
      .filter(r => r.status === 'RECEIVED')
      .reduce((s, r) => s + r.amount, 0);
    const expectedRevenue = revenueRecords
      .filter(r => ['EXPECTED', 'INVOICED', 'RECEIVABLE'].includes(r.status))
      .reduce((s, r) => s + r.amount, 0);

    const projectCosts = await this.prisma.projectCost.findMany({
      where: { companyId, project: { clientId } },
    });
    const directCosts = projectCosts
      .filter(c => c.status === 'PAID')
      .reduce((s, c) => s + c.amount, 0);

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, clientId },
    });
    const invoicedTotal = invoices.reduce((s, inv) => s + inv.total, 0);
    const paidInvoices = invoices.filter(inv => inv.status === 'PAID').reduce((s, inv) => s + inv.total, 0);
    const outstandingReceivables = invoicedTotal - paidInvoices;

    return {
      clientId,
      totalRevenue,
      expectedRevenue,
      directCosts,
      grossContribution: totalRevenue - directCosts,
      outstandingReceivables,
      note: 'All figures from authoritative DB records — no client-supplied totals accepted',
    };
  }

  async getBillingMilestones(companyId: string, projectId?: string, contractId?: string) {
    return this.prisma.billingMilestone.findMany({
      where: {
        companyId,
        ...(projectId ? { projectId } : {}),
        ...(contractId ? { contractId } : {}),
      },
      include: { contract: true, project: true, invoice: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createBillingMilestone(
    companyId: string,
    actorId: string,
    dto: {
      contractId: string;
      projectId?: string;
      name: string;
      description?: string;
      amount: number;
      currency?: string;
      billingCondition: string;
      dueAt?: Date;
    },
  ) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }

    const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
    if (!contract || contract.companyId !== companyId) {
      throw new ForbiddenException('Contract does not belong to company');
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.companyId !== companyId) {
        throw new ForbiddenException('Project does not belong to company');
      }
    }

    return this.prisma.billingMilestone.create({
      data: {
        companyId,
        contractId: dto.contractId,
        projectId: dto.projectId,
        name: dto.name,
        description: dto.description,
        amount: dto.amount,
        currency: dto.currency ?? 'INR',
        billingCondition: dto.billingCondition,
        dueAt: dto.dueAt,
      },
    });
  }
}
