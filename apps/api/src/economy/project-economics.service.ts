import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectEconomicsService {
  constructor(private prisma: PrismaService) {}

  async calculateProjectEconomics(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        revenueRecords: true,
        projectCosts: true,
      }
    });

    if (!project) throw new NotFoundException('Project not found');

    let expectedRevenue = 0;
    let realizedRevenue = 0;

    for (const rec of project.revenueRecords) {
      if (rec.status === 'RECEIVED') {
        realizedRevenue += rec.amount;
        expectedRevenue += rec.amount;
      } else if (rec.status !== 'CANCELLED') {
        expectedRevenue += rec.amount;
      }
    }

    let actualCost = 0;
    let estimatedCost = 0;
    let acCost = 0;

    for (const cost of project.projectCosts) {
      if (cost.currency === 'AC') {
        acCost += cost.amount;
      } else if (cost.currency === 'INR') {
        if (cost.status === 'PAID') {
          actualCost += cost.amount;
          estimatedCost += cost.amount;
        } else if (cost.status !== 'CANCELLED') {
          estimatedCost += cost.amount;
        }
      }
    }

    const margin = realizedRevenue - actualCost;
    
    let financialStatus = 'HEALTHY';
    if (margin < 0 && actualCost > 0) financialStatus = 'LOSS';
    if (actualCost > expectedRevenue) financialStatus = 'OVERBUDGET';

    return this.prisma.project.update({
      where: { id: projectId },
      data: {
        expectedRevenue,
        realizedRevenue,
        actualCost,
        estimatedCost,
        acCost,
        margin,
        financialStatus
      }
    });
  }

  async recordCost(projectId: string, companyId: string, amount: number, category: string, currency: string = 'AC', source: string = 'SYSTEM') {
    return this.prisma.projectCost.create({
      data: {
        projectId,
        companyId,
        amount,
        category,
        currency,
        source,
        status: 'ESTIMATED'
      }
    });
  }
}
