import { Injectable } from '@nestjs/common';
import { CompanyStateService } from '../management/company-state.service';
import { CompanyHealthService } from '../management/company-health.service';
import { PrismaService } from '../prisma/prisma.service';

export interface StrategicStateSnapshot {
  companyId: string;
  snapshotAt: Date;
  artifactType: 'ANALYSIS';
  // Derived from authoritative sources — read-only, never written back as facts
  companyPosition: {
    activeEmployees: number;
    departments: number;
    activeProjects: number;
    acBalance: number;
    openInvoices: number;
    closedWonDeals: number;
    activeCustomers: number;
  };
  signalQuality: {
    missingData: string[];
    confidence: number;
  };
  activeObjectives: number;
  activeInitiatives: number;
  openRisks: number;
  openOpportunities: number;
  healthStatus: string | null;
  warnings: string[];
}

@Injectable()
export class StrategyStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateSvc: CompanyStateService,
    private readonly healthSvc: CompanyHealthService,
  ) {}

  async collectStrategicState(companyId: string): Promise<StrategicStateSnapshot> {
    const [state, health, objectives, initiatives, risks, opportunities] = await Promise.all([
      this.stateSvc.collectState(companyId),
      this.prisma.companyHealthSnapshot.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.companyObjective.count({ where: { companyId, status: { in: ['ACTIVE', 'AT_RISK'] } } }),
      this.prisma.strategicInitiative.count({ where: { companyId, status: 'ACTIVE' } }),
      this.prisma.companyRisk.count({ where: { companyId, status: { in: ['IDENTIFIED', 'MITIGATING'] } } }),
      this.prisma.companyOpportunity.count({ where: { companyId, status: 'IDENTIFIED' } }),
    ]);

    const missingData: string[] = [];
    if (state.finance.acBalance === 0) missingData.push('AC balance unverified');
    if (state.workforce.activeEmployees === 0) missingData.push('No active workforce data');

    return {
      companyId,
      snapshotAt: new Date(),
      artifactType: 'ANALYSIS',
      companyPosition: {
        activeEmployees: state.workforce.activeEmployees,
        departments: state.workforce.departments,
        activeProjects: state.projects.active,
        acBalance: state.finance.acBalance,
        openInvoices: state.finance.openInvoices,
        closedWonDeals: state.sales.closedWon,
        activeCustomers: state.customers.active,
      },
      signalQuality: {
        missingData,
        confidence: missingData.length === 0 ? 90 : 60,
      },
      activeObjectives: objectives,
      activeInitiatives: initiatives,
      openRisks: risks,
      openOpportunities: opportunities,
      healthStatus: health?.status ?? null,
      warnings: missingData,
    };
  }
}
