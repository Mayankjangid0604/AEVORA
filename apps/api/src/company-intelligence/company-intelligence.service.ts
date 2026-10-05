import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStateService } from '../management/company-state.service';
import { SalesPipelineService } from '../sales/sales-pipeline.service';

export interface V9IntelligenceQuery {
  question?: string;
  period?: string;
}

export interface V9IntelligenceResponse {
  question?: string;
  scope: 'COMPANY' | 'GROUP';
  companyId?: string;
  companyIds?: string[];
  period?: string;
  generatedAt: string;
  sourceFreshness: Record<string, string>;
  facts: any[];
  metrics: any[];
  observations: any[];
  trends: any[];
  risks: any[];
  opportunities: any[];
  anomalies: any[];
  supportingSources: any[];
  provenance: any[];
  confidence: number;
  uncertainty: string[];
  limitations: string[];
  missingData: string[];
}

@Injectable()
export class CompanyIntelligenceService {
  private readonly logger = new Logger(CompanyIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companyState: CompanyStateService,
    private readonly salesPipeline: SalesPipelineService,
  ) {}

  async generateCompanyIntelligence(companyId: string, query: V9IntelligenceQuery = {}): Promise<V9IntelligenceResponse> {
    const now = new Date();
    
    // Check missing data by testing if company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { group: true }
    });
    
    if (!company) {
      throw new Error('Company not found');
    }

    const state = await this.companyState.collectState(companyId);
    let pipeline;
    try {
      pipeline = await this.salesPipeline.getPipelineMetrics(companyId);
    } catch (e) {
      pipeline = null;
    }
    
    const facts = [];
    const metrics = [];
    const risks = [];
    const opportunities = [];
    const trends = [];
    const observations = [];
    const anomalies = [];
    const missingData = [];
    const provenance = [];
    const sourceFreshness: Record<string, string> = {};

    sourceFreshness['CompanyState'] = state.snapshotAt.toISOString();

    // Mapping Company State to Facts and Metrics
    metrics.push({ key: 'totalEmployees', value: state.workforce.totalEmployees, domain: 'Workforce' });
    metrics.push({ key: 'activeProjects', value: state.projects.active, domain: 'Projects' });
    metrics.push({ key: 'acBalance', value: state.finance.acBalance, domain: 'Finance' });
    metrics.push({ key: 'totalRevenue', value: state.finance.totalRevenue, domain: 'Finance' });
    metrics.push({ key: 'openInvoices', value: state.finance.openInvoices, domain: 'Finance' });
    
    if (pipeline) {
      metrics.push({ key: 'pipelineValue', value: pipeline.weightedPipelineValue, domain: 'Sales' });
      sourceFreshness['SalesPipeline'] = now.toISOString();
    } else {
      missingData.push('Sales pipeline metrics are currently unavailable or company has no active pipeline.');
    }
    
    facts.push({
      statement: `Company has ${state.workforce.totalEmployees} employees across ${state.workforce.departments} departments.`,
      source: 'Workforce'
    });
    provenance.push({ domain: 'Workforce', metricUsed: 'totalEmployees', sourceTimestamp: state.snapshotAt.toISOString() });

    // Risks
    if (state.strategicPlanning.criticalRisks > 0) {
      risks.push({ title: 'Critical Strategic Risks', count: state.strategicPlanning.criticalRisks });
    }
    if (state.projects.blocked > 0) {
      risks.push({ title: 'Blocked Projects', count: state.projects.blocked });
    }
    if (state.kpis.critical > 0) {
      risks.push({ title: 'Critical KPIs Failing', count: state.kpis.critical });
    }
    
    // Opportunities
    if (state.sales.openOpportunities > 0) {
      opportunities.push({ title: 'Open Sales Opportunities', count: state.sales.openOpportunities });
    }
    
    // Trends
    if (state.kpis.improving > state.kpis.declining) {
      trends.push({ title: 'Overall KPI Trend Improving', description: 'More KPIs are improving than declining.' });
    }
    
    // Missing Data Handling
    if (state.workforce.totalEmployees === 0) {
      missingData.push('No workforce data available.');
    }
    if (state.finance.acBalance === 0 && state.finance.totalRevenue === 0) {
      missingData.push('No significant financial activity recorded.');
    }

    return {
      question: query.question,
      scope: 'COMPANY',
      companyId,
      period: query.period || 'current',
      generatedAt: now.toISOString(),
      sourceFreshness,
      facts,
      metrics,
      observations,
      trends,
      risks,
      opportunities,
      anomalies,
      supportingSources: ['CompanyStateService', 'SalesPipelineService'],
      provenance,
      confidence: 0.95,
      uncertainty: ['Metrics rely on snapshot data which may be up to 1 hour delayed.'],
      limitations: ['Qualitative analysis of risks depends on proper logging by department heads.', ...missingData],
      missingData
    };
  }
}
