import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStateService, CompanyStateSnapshot } from './company-state.service';
import { CompanyHealthStatus } from '@prisma/client';

export interface HealthAnalysis {
  status: CompanyHealthStatus;
  financialScore: number;
  salesScore: number;
  marketingScore: number;
  workforceScore: number;
  operationsScore: number;
  customerScore: number;
  evidence: Record<string, unknown>;
  reasons: string[];
}

@Injectable()
export class CompanyHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateSvc: CompanyStateService,
  ) {}

  analyzeHealth(state: CompanyStateSnapshot): HealthAnalysis {
    const reasons: string[] = [];
    const evidence: Record<string, unknown> = {};

    // Financial score (0-100)
    let financialScore = 50;
    if (state.finance.acBalance > 10000) financialScore = 80;
    else if (state.finance.acBalance < 1000) { financialScore = 25; reasons.push('Low AC balance'); }
    if (state.finance.openInvoices > 5) { financialScore -= 10; reasons.push('Multiple unpaid invoices'); }
    evidence.finance = { acBalance: state.finance.acBalance, openInvoices: state.finance.openInvoices, totalRevenue: state.finance.totalRevenue };

    // Sales score
    let salesScore = 50;
    const pipeline = state.sales.openOpportunities + state.sales.totalLeads;
    if (pipeline > 10) salesScore = 75;
    else if (pipeline === 0) { salesScore = 20; reasons.push('No active sales pipeline'); }
    if (state.sales.closedWon > 0) salesScore = Math.min(100, salesScore + 10);
    evidence.sales = state.sales;

    // Marketing score
    let marketingScore = 50;
    if (state.marketing.activeCampaigns > 0) marketingScore = 70;
    else { marketingScore = 30; reasons.push('No active marketing campaigns'); }
    evidence.marketing = state.marketing;

    // Workforce score
    let workforceScore = 50;
    const activeRatio = state.workforce.totalEmployees > 0
      ? state.workforce.activeEmployees / state.workforce.totalEmployees
      : 0;
    if (activeRatio >= 0.9) workforceScore = 80;
    else if (activeRatio < 0.7) { workforceScore = 30; reasons.push('High proportion of non-active workforce'); }
    evidence.workforce = state.workforce;

    // Operations score
    let operationsScore = 50;
    if (state.projects.blocked > 0) { operationsScore -= 10; reasons.push(`${state.projects.blocked} blocked project(s)`); }
    if (state.tasks.blocked > 5) { operationsScore -= 15; reasons.push(`${state.tasks.blocked} blocked task(s)`); }
    if (state.projects.active > 0) operationsScore = Math.min(100, operationsScore + 15);
    evidence.operations = { projects: state.projects, tasks: state.tasks };

    // Customer score
    let customerScore = 50;
    if (state.customers.total > 0) customerScore = 70;
    else { reasons.push('No active customers'); customerScore = 20; }
    evidence.customers = state.customers;

    // Aggregate
    const scores = [financialScore, salesScore, marketingScore, workforceScore, operationsScore, customerScore];
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const criticalCount = scores.filter(s => s < 25).length;
    const lowCount = scores.filter(s => s < 40).length;

    let status: CompanyHealthStatus;
    if (criticalCount >= 2 || avg < 30) status = CompanyHealthStatus.CRITICAL;
    else if (criticalCount >= 1 || avg < 45) status = CompanyHealthStatus.AT_RISK;
    else if (lowCount >= 1 || avg < 60) status = CompanyHealthStatus.WATCH;
    else status = CompanyHealthStatus.HEALTHY;

    return {
      status,
      financialScore: Math.max(0, Math.min(100, financialScore)),
      salesScore: Math.max(0, Math.min(100, salesScore)),
      marketingScore: Math.max(0, Math.min(100, marketingScore)),
      workforceScore: Math.max(0, Math.min(100, workforceScore)),
      operationsScore: Math.max(0, Math.min(100, operationsScore)),
      customerScore: Math.max(0, Math.min(100, customerScore)),
      evidence,
      reasons,
    };
  }

  async generateAndStoreSnapshot(companyId: string, generatedBy: string, cycleId?: string) {
    const state = await this.stateSvc.collectState(companyId);
    const analysis = this.analyzeHealth(state);

    return this.prisma.companyHealthSnapshot.create({
      data: {
        companyId,
        status: analysis.status,
        financialScore: analysis.financialScore,
        salesScore: analysis.salesScore,
        marketingScore: analysis.marketingScore,
        workforceScore: analysis.workforceScore,
        operationsScore: analysis.operationsScore,
        customerScore: analysis.customerScore,
        evidence: analysis.evidence as any,
        reasons: analysis.reasons as any,
        generatedBy,
        calculationVersion: '1.0',
        cycleId,
      },
    });
  }

  async getLatestSnapshot(companyId: string) {
    return this.prisma.companyHealthSnapshot.findFirst({
      where: { companyId },
      orderBy: { snapshotAt: 'desc' },
    });
  }

  async getSnapshotHistory(companyId: string, limit = 30) {
    return this.prisma.companyHealthSnapshot.findMany({
      where: { companyId },
      orderBy: { snapshotAt: 'desc' },
      take: limit,
    });
  }
}
