import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FinancialReportingService {
  constructor(private prisma: PrismaService) {}

  async generateCompanyReport(companyId: string) {
    const revenueRecords = await this.prisma.revenueRecord.findMany({ where: { companyId } });
    const expenses = await this.prisma.companyExpense.findMany({ where: { companyId } });
    const payrollRuns = await this.prisma.payrollRun.findMany({ where: { companyId } });
    const funding = await this.prisma.chairmanFundingRecord.findMany({ where: { companyId } });
    
    let realizedRevenue = 0;
    let expectedRevenue = 0;
    revenueRecords.forEach(r => {
      if (r.status === 'RECEIVED') realizedRevenue += r.amount;
      if (r.status === 'EXPECTED' || r.status === 'INVOICED' || r.status === 'RECEIVABLE') expectedRevenue += r.amount;
    });

    let paidExpenses = 0;
    expenses.forEach(e => {
      if (e.status === 'PAID') paidExpenses += e.amount;
    });

    // Payroll is in AC. For P&L in INR, we assume 1000 AC = 1 INR
    let paidPayrollAC = 0;
    payrollRuns.forEach(p => {
      if (p.status === 'PAID') paidPayrollAC += p.totalAmount;
    });
    
    const payrollCostINR = Math.floor(paidPayrollAC / 1000);

    let totalFunding = 0;
    funding.forEach(f => totalFunding += f.amount);

    const operatingResult = realizedRevenue - paidExpenses - payrollCostINR;
    
    // Cash flow strictly uses real money
    const cashPosition = totalFunding + realizedRevenue - paidExpenses;

    // Runway calculation (only uses real money cash expenses for burn)
    let runway = 'INSUFFICIENT_DATA';
    const totalCashBurn = paidExpenses; // Only actual real-money cash expenses
    if (totalCashBurn > 0) {
      runway = Math.floor(cashPosition / totalCashBurn).toString() + ' months';
    }

    return {
      openingBalance: totalFunding,
      realizedRevenue,
      expectedRevenue,
      paidExpenses,
      payrollCostAC: paidPayrollAC,
      payrollCostINR,
      operatingResult, // Analytical P&L
      cashPosition,    // Actual Real Money
      runway,
    };
  }
}
