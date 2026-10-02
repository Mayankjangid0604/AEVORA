import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerHealthDimension } from '@prisma/client';

@Injectable()
export class CustomerHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateHealth(clientId: string, companyId: string, calculatedBy: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        projects: {
          where: { companyId },
          include: { tasks: true, risks: { where: { status: 'OPEN' } } },
        },
        Invoice: { where: { companyId } },
      },
    });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }

    const now = new Date();
    const records: Array<{ dimension: CustomerHealthDimension; score: number; facts: any[]; recommendations: any[] }> = [];

    // --- Delivery health ---
    const allTasks = client.projects.flatMap(p => p.tasks);
    const blockedTasks = allTasks.filter(t => t.status === 'BLOCKED').length;
    const overdueTasks = allTasks.filter(t => t.dueAt && t.dueAt < now && t.status !== 'COMPLETED').length;
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'COMPLETED').length;
    const openRisks = client.projects.flatMap(p => p.risks).length;

    let deliveryScore = 100;
    const deliveryFacts: string[] = [];
    const deliveryRecs: string[] = [];

    if (blockedTasks > 0) {
      deliveryScore -= blockedTasks * 10;
      deliveryFacts.push(`${blockedTasks} blocked task(s)`);
      deliveryRecs.push('Resolve blocked tasks immediately');
    }
    if (overdueTasks > 0) {
      deliveryScore -= overdueTasks * 8;
      deliveryFacts.push(`${overdueTasks} overdue task(s)`);
      deliveryRecs.push('Review overdue tasks and update timeline');
    }
    if (openRisks > 2) {
      deliveryScore -= (openRisks - 2) * 5;
      deliveryFacts.push(`${openRisks} open project risk(s)`);
      deliveryRecs.push('Mitigate open risks');
    }
    if (totalTasks > 0) {
      deliveryFacts.push(`${completedTasks}/${totalTasks} tasks completed`);
    }
    records.push({
      dimension: CustomerHealthDimension.DELIVERY,
      score: Math.max(0, Math.min(100, deliveryScore)),
      facts: deliveryFacts,
      recommendations: deliveryRecs,
    });

    // --- Financial health ---
    const overdueInvoices = client.Invoice.filter(
      inv => inv.status === 'OVERDUE' || (inv.dueDate && inv.dueDate < now && inv.status !== 'PAID'),
    ).length;
    const totalInvoiced = client.Invoice.reduce((s, inv) => s + inv.total, 0);
    const paidAmount = client.Invoice.filter(inv => inv.status === 'PAID').reduce((s, inv) => s + inv.total, 0);
    const collectionRate = totalInvoiced > 0 ? paidAmount / totalInvoiced : 1;

    let financialScore = 100;
    const financialFacts: string[] = [];
    const financialRecs: string[] = [];

    if (overdueInvoices > 0) {
      financialScore -= overdueInvoices * 20;
      financialFacts.push(`${overdueInvoices} overdue invoice(s)`);
      financialRecs.push('Follow up on overdue invoices');
    }
    if (collectionRate < 0.8) {
      financialScore -= 20;
      financialFacts.push(`Collection rate: ${Math.round(collectionRate * 100)}%`);
      financialRecs.push('Investigate low collection rate');
    } else {
      financialFacts.push(`Collection rate: ${Math.round(collectionRate * 100)}%`);
    }
    records.push({
      dimension: CustomerHealthDimension.FINANCIAL,
      score: Math.max(0, Math.min(100, financialScore)),
      facts: financialFacts,
      recommendations: financialRecs,
    });

    // --- Overall ---
    const avgScore = Math.round(records.reduce((s, r) => s + r.score, 0) / records.length);
    const allFacts = records.flatMap(r => r.facts);
    const allRecs = records.flatMap(r => r.recommendations);
    records.push({
      dimension: CustomerHealthDimension.OVERALL,
      score: avgScore,
      facts: allFacts,
      recommendations: allRecs,
    });

    // Persist health records
    const saved = await this.prisma.$transaction(
      records.map(r =>
        this.prisma.customerHealthRecord.create({
          data: {
            companyId,
            clientId,
            dimension: r.dimension,
            score: r.score,
            facts: r.facts,
            recommendations: r.recommendations,
            calculatedBy,
          },
        }),
      ),
    );

    return saved;
  }

  async getLatestHealth(clientId: string, companyId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }

    return this.prisma.customerHealthRecord.findMany({
      where: { companyId, clientId },
      orderBy: { calculatedAt: 'desc' },
      take: 4,
    });
  }
}
