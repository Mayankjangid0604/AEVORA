import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  async createCompanyBudget(companyId: string, period: string, allocatedAmount: number) {
    if (allocatedAmount < 0) throw new BadRequestException('Amount cannot be negative');
    return this.prisma.companyBudget.create({
      data: { companyId, period, allocatedAmount }
    });
  }

  async checkBudgetAvailability(companyId: string, period: string, requiredAmount: number) {
    const budget = await this.prisma.companyBudget.findFirst({
      where: { companyId, period }
    });
    if (!budget) return false;
    return (budget.allocatedAmount - budget.committedAmount - budget.spentAmount) >= requiredAmount;
  }
}
