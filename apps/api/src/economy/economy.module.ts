import { Module } from '@nestjs/common';
import { EconomyService } from './economy.service';
import { EconomyController } from './economy.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueService } from './revenue.service';
import { ProjectEconomicsService } from './project-economics.service';
import { PayrollService } from './payroll.service';
import { ExpenseService } from './expense.service';
import { BudgetService } from './budget.service';
import { FinancialReportingService } from './financial-reporting.service';

@Module({
  controllers: [EconomyController],
  providers: [
    EconomyService, 
    PrismaService, 
    RevenueService, 
    ProjectEconomicsService, 
    PayrollService, 
    ExpenseService, 
    BudgetService, 
    FinancialReportingService
  ],
  exports: [
    EconomyService,
    RevenueService, 
    ProjectEconomicsService, 
    PayrollService, 
    ExpenseService, 
    BudgetService, 
    FinancialReportingService
  ],
})
export class EconomyModule {}
