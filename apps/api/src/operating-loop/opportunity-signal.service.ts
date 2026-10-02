import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Automated opportunity detection from company signals: KPIs, performance, events.
 * Creates CompanyOpportunity records when patterns are detected.
 */
@Injectable()
export class OpportunitySignalService {
  private readonly logger = new Logger(OpportunitySignalService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scan(companyId: string) {
    const detected: any[] = [];

    const [kpis, health, leads, projects] = await Promise.all([
      this.prisma.companyKPI.findMany({ where: { companyId } }),
      this.prisma.companyHealthSnapshot.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.salesLead.count({ where: { companyId, status: 'QUALIFIED' } }),
      this.prisma.project.findMany({ where: { companyId, status: 'COMPLETED' }, take: 5, orderBy: { updatedAt: 'desc' } }),
    ]);

    // Exceeding KPIs → expansion opportunity
    const exceeding = kpis.filter(k => k.status === 'EXCEEDED');
    if (exceeding.length > 0) {
      detected.push({
        title: `${exceeding.length} KPIs exceeding targets — consider raising ambitions`,
        opportunityType: 'CUSTOMER_EXPANSION',
        evidence: exceeding.map(k => `${k.name}: ${k.currentValue}/${k.target}`),
        expectedImpact: { revenue: 'MEDIUM', growth: 'HIGH' },
      });
    }

    // Interested leads not converted → sales opportunity
    if (leads > 3) {
      detected.push({
        title: `${leads} qualified leads awaiting conversion`,
        opportunityType: 'SALES_OPPORTUNITY',
        evidence: [`${leads} leads with QUALIFIED status`],
        expectedImpact: { revenue: 'HIGH', effort: 'LOW' },
      });
    }

    // Completed projects → upsell opportunity
    if (projects.length > 0) {
      detected.push({
        title: `${projects.length} recently completed projects — upsell opportunity`,
        opportunityType: 'CUSTOMER_EXPANSION',
        evidence: projects.map(p => `Project: ${p.name}`),
        expectedImpact: { revenue: 'MEDIUM', retention: 'HIGH' },
      });
    }

    // High workforce score + low sales → efficiency opportunity
    if (health && health.workforceScore > 70 && health.salesScore < 50) {
      detected.push({
        title: 'Strong workforce underutilized — redirect to sales support',
        opportunityType: 'EFFICIENCY_IMPROVEMENT',
        evidence: [`Workforce: ${health.workforceScore}, Sales: ${health.salesScore}`],
        expectedImpact: { efficiency: 'HIGH', revenue: 'MEDIUM' },
      });
    }

    // Persist detected opportunities (skip duplicates by title within 24h)
    const dayAgo = new Date(Date.now() - 86_400_000);
    for (const opp of detected) {
      const exists = await this.prisma.companyOpportunity.findFirst({
        where: { companyId, title: opp.title, createdAt: { gte: dayAgo } },
      });
      if (exists) continue;

      const owner = await this.prisma.employee.findFirst({
        where: { companyId, agent: { isNot: null } },
        orderBy: { createdAt: 'asc' },
      });
      if (!owner) continue;

      await this.prisma.companyOpportunity.create({
        data: {
          companyId,
          title: opp.title,
          opportunityType: opp.opportunityType,
          evidence: opp.evidence as any,
          expectedImpact: opp.expectedImpact as any,
          ownerId: owner.id,
          status: 'IDENTIFIED',
          isAdvisory: true,
        },
      });
      this.logger.log(`Opportunity detected: ${opp.title}`);
    }

    return detected;
  }

  async listIdentified(companyId: string, limit = 20) {
    return this.prisma.companyOpportunity.findMany({
      where: { companyId, status: 'IDENTIFIED' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
