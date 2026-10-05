import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseStatus } from '@prisma/client';
import { EconomyService } from './economy.service';

@Injectable()
export class ExpenseService {
  constructor(
    private prisma: PrismaService,
    private economyService: EconomyService
  ) {}

  async proposeExpense(companyId: string, category: string, amount: number, description?: string) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    
    return this.prisma.companyExpense.create({
      data: {
        companyId,
        category,
        amount,
        status: ExpenseStatus.PROPOSED,
        description
      }
    });
  }

  async approveExpense(expenseId: string, approvedBy: string) {
    const expense = await this.prisma.companyExpense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status !== ExpenseStatus.PROPOSED) throw new BadRequestException('Only PROPOSED expenses can be approved');

    return this.prisma.companyExpense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.APPROVED, approvedBy }
    });
  }

  async payExpense(expenseId: string, externalAccountId: string, idempotencyKey?: string) {
    const expense = await this.prisma.companyExpense.findUnique({ where: { id: expenseId } });
    if (!expense) throw new NotFoundException('Expense not found');
    if (expense.status === ExpenseStatus.PAID) return expense;
    if (expense.status !== ExpenseStatus.APPROVED) throw new BadRequestException('Only APPROVED expenses can be paid');

    const companyRealMoney = await this.prisma.realMoneyAccount.findUnique({ where: { companyId: expense.companyId } });
    if (!companyRealMoney) throw new BadRequestException('Company real money account not found');

    if (expense.currency === 'INR') {
      await this.economyService.transferRealMoney(
        companyRealMoney.id,
        externalAccountId,
        expense.amount,
        `Payment for expense ${expenseId}`,
        idempotencyKey
      );
    } else {
       throw new BadRequestException('Unsupported currency for Expense');
    }

    return this.prisma.companyExpense.update({
      where: { id: expenseId },
      data: { status: ExpenseStatus.PAID, paidAt: new Date() }
    });
  }
}
