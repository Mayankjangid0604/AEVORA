import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyIntelligenceService, V9IntelligenceQuery, V9IntelligenceResponse } from './company-intelligence.service';

@Injectable()
export class GroupIntelligenceService {
  private readonly logger = new Logger(GroupIntelligenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companyIntelligenceService: CompanyIntelligenceService,
  ) {}

  async generateGroupIntelligence(groupId: string, actorId: string, query: V9IntelligenceQuery = {}): Promise<V9IntelligenceResponse> {
    const now = new Date();
    
    const group = await this.prisma.aevoraGroup.findFirst({
      where: { id: groupId, chairmanId: actorId },
      include: { companies: true }
    });
    
    if (!group) {
      throw new Error('Group not found or unauthorized');
    }

    const companyIds = group.companies.map(c => c.id);
    const companyIntelligences = await Promise.all(
      companyIds.map(id => this.companyIntelligenceService.generateCompanyIntelligence(id, query))
    );

    const aggregateMetrics = [];
    const allRisks = [];
    const allOpportunities = [];
    const allMissingData = [];
    const allProvenance = [];
    
    let totalEmployees = 0;
    let totalRevenue = 0;
    let acBalance = 0;

    for (const ci of companyIntelligences) {
      const empMetric = ci.metrics.find(m => m.key === 'totalEmployees');
      if (empMetric) totalEmployees += empMetric.value;
      
      const revMetric = ci.metrics.find(m => m.key === 'totalRevenue');
      if (revMetric) totalRevenue += revMetric.value;
      
      const balMetric = ci.metrics.find(m => m.key === 'acBalance');
      if (balMetric) acBalance += balMetric.value;

      allRisks.push(...ci.risks.map(r => ({ ...r, companyId: ci.companyId })));
      allOpportunities.push(...ci.opportunities.map(o => ({ ...o, companyId: ci.companyId })));
      allMissingData.push(...ci.missingData.map(md => `Company ${ci.companyId}: ${md}`));
      allProvenance.push(...ci.provenance.map(p => ({ ...p, companyId: ci.companyId })));
    }
    
    aggregateMetrics.push({ key: 'totalEmployees', value: totalEmployees, domain: 'Workforce' });
    aggregateMetrics.push({ key: 'totalRevenue', value: totalRevenue, domain: 'Finance' });
    aggregateMetrics.push({ key: 'acBalance', value: acBalance, domain: 'Finance' });

    return {
      question: query.question,
      scope: 'GROUP',
      companyIds,
      period: query.period || 'current',
      generatedAt: now.toISOString(),
      sourceFreshness: { GroupAggregation: now.toISOString() },
      facts: [{ statement: `Group comprises ${companyIds.length} companies with ${totalEmployees} total employees.`, source: 'GroupAggregation' }],
      metrics: aggregateMetrics,
      observations: [],
      trends: [],
      risks: allRisks,
      opportunities: allOpportunities,
      anomalies: [],
      supportingSources: ['CompanyIntelligenceService'],
      provenance: allProvenance,
      confidence: 0.9,
      uncertainty: ['Group aggregation relies on individual company data snapshots.'],
      limitations: allMissingData,
      missingData: allMissingData
    };
  }
}
