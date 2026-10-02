import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ActionResult {
  action: string;
  dispatched: boolean;
  service: string;
  result: unknown;
  executedAt: string;
}

/**
 * Maps OODA recommendations to real AEVORA service calls.
 * Each action pattern triggers an actual backend operation.
 */
@Injectable()
export class ActionDispatchService {
  private readonly logger = new Logger(ActionDispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async dispatch(companyId: string, recommendation: { title: string; impact?: string; effort?: string }): Promise<ActionResult> {
    const originalTitle = recommendation?.title ?? '';
    const normalized = originalTitle.toLowerCase();
    const now = new Date().toISOString();

    try {
      if (normalized.includes('lead generation') || normalized.includes('lead gen') || normalized.includes('increase lead')) {
        return await this.adjustLeadGen(companyId, originalTitle, normalized, now);
      }
      if (normalized.includes('sales') || normalized.includes('outreach') || normalized.includes('pipeline')) {
        return await this.boostSales(companyId, originalTitle, normalized, now);
      }
      if (normalized.includes('spending') || normalized.includes('cost') || normalized.includes('budget') || normalized.includes('financial')) {
        return await this.adjustFinancials(companyId, originalTitle, now);
      }
      if (normalized.includes('agent') || normalized.includes('retrain') || normalized.includes('workload') || normalized.includes('workforce') || normalized.includes('reassign')) {
        return await this.adjustWorkforce(companyId, originalTitle, normalized, now);
      }
      if (normalized.includes('kpi') || normalized.includes('target')) {
        return await this.adjustKpis(companyId, originalTitle, normalized, now);
      }
      if (normalized.includes('opportunity') || normalized.includes('explore')) {
        return await this.pursueOpportunities(companyId, originalTitle, now);
      }

      return { action: originalTitle, dispatched: false, service: 'none', result: 'no matching dispatcher', executedAt: now };
    } catch (e) {
      this.logger.error(`Action dispatch failed for "${originalTitle}": ${(e as Error).message}`);
      return { action: originalTitle, dispatched: false, service: 'error', result: (e as Error).message, executedAt: now };
    }
  }

  private async adjustLeadGen(companyId: string, originalTitle: string, normalized: string, now: string): Promise<ActionResult> {
    const config = await this.prisma.leadGenConfig.findUnique({ where: { companyId } });
    if (!config) {
      return { action: originalTitle, dispatched: false, service: 'lead-gen', result: 'no lead-gen config for company', executedAt: now };
    }

    if (normalized.includes('increase') || normalized.includes('expand') || normalized.includes('radius')) {
      const newRadius = Math.min(config.radiusM * 1.5, 100000);
      await this.prisma.leadGenConfig.update({ where: { companyId }, data: { radiusM: Math.round(newRadius) } });
      return { action: originalTitle, dispatched: true, service: 'lead-gen', result: { radiusM: config.radiusM, newRadiusM: Math.round(newRadius) }, executedAt: now };
    }

    if (normalized.includes('interval') || normalized.includes('faster') || normalized.includes('frequent')) {
      const newInterval = Math.max(config.intervalHours * 0.5, 0.5);
      await this.prisma.leadGenConfig.update({ where: { companyId }, data: { intervalHours: newInterval } });
      return { action: originalTitle, dispatched: true, service: 'lead-gen', result: { intervalHours: config.intervalHours, newIntervalHours: newInterval }, executedAt: now };
    }

    return { action: originalTitle, dispatched: false, service: 'lead-gen', result: 'lead-gen config unchanged — action not specific enough', executedAt: now };
  }

  private async boostSales(companyId: string, originalTitle: string, normalized: string, now: string): Promise<ActionResult> {
    const qualified = await this.prisma.salesLead.count({ where: { companyId, status: 'QUALIFIED' } });
    if (qualified > 0) {
      await this.prisma.operationalAlert.create({
        data: {
          companyId,
          category: 'SALES_PRIORITY',
          severity: 'CRITICAL',
          title: `OODA: Prioritize ${qualified} qualified leads`,
          description: `Automated action from OODA loop: "${originalTitle}". ${qualified} leads in QUALIFIED status need conversion focus.`,
          status: 'ACTIVE',
        },
      });
    }
    return { action: originalTitle, dispatched: qualified > 0, service: 'sales', result: { qualifiedLeads: qualified, alertCreated: qualified > 0 }, executedAt: now };
  }

  private async adjustFinancials(companyId: string, originalTitle: string, now: string): Promise<ActionResult> {
    const ceo = await this.prisma.employee.findFirst({ where: { companyId, agent: { isNot: null } }, orderBy: { createdAt: 'asc' } });
    if (!ceo) {
      return { action: originalTitle, dispatched: false, service: 'finance', result: 'no agent employee found', executedAt: now };
    }

    const proposal = await this.prisma.decisionProposal.create({
      data: {
        companyId,
        employeeId: ceo.id,
        title: `OODA Financial Action: ${originalTitle}`,
        problem: 'Financial health issue detected by OODA loop',
        recommendation: originalTitle,
        rationale: 'Automated proposal from OODA operating loop',
        impactLevel: 'HIGH',
        status: 'PROPOSED',
      },
    });
    return { action: originalTitle, dispatched: true, service: 'finance', result: { proposalId: proposal.id }, executedAt: now };
  }

  private async adjustWorkforce(companyId: string, originalTitle: string, normalized: string, now: string): Promise<ActionResult> {
    if (normalized.includes('retrain') || normalized.includes('low quality')) {
      const lowPerf = await this.prisma.employeePerformance.findMany({
        where: { employee: { companyId }, qualityScore: { lt: 50 } },
        include: { employee: { select: { id: true, name: true } } },
        take: 5,
      });
      for (const p of lowPerf) {
        await this.prisma.operationalAlert.create({
          data: {
            companyId,
            category: 'PERFORMANCE_WARNING',
            severity: 'WARNING',
            title: `OODA: Retrain ${p.employee.name} (quality: ${p.qualityScore})`,
            description: `Agent quality score ${p.qualityScore}/100 is below threshold.`,
            status: 'ACTIVE',
          },
        });
      }
      return { action: originalTitle, dispatched: lowPerf.length > 0, service: 'workforce', result: { flagged: lowPerf.length }, executedAt: now };
    }

    await this.prisma.operationalAlert.create({
      data: {
        companyId,
        category: 'WORKLOAD_REVIEW',
        severity: 'WARNING',
        title: `OODA: ${originalTitle}`,
        description: 'Automated OODA recommendation for workforce adjustment.',
        status: 'ACTIVE',
      },
    });
    return { action: originalTitle, dispatched: true, service: 'workforce', result: { alertCreated: true }, executedAt: now };
  }

  private async adjustKpis(companyId: string, originalTitle: string, normalized: string, now: string): Promise<ActionResult> {
    if (normalized.includes('adjust') || normalized.includes('realistic')) {
      const critical = await this.prisma.companyKPI.findMany({ where: { companyId, status: 'CRITICAL' } });
      let adjusted = 0;
      for (const kpi of critical) {
        if (kpi.target != null) {
          await this.prisma.companyKPI.update({
            where: { id: kpi.id },
            data: { target: kpi.target * 0.9 },
          });
          adjusted++;
        }
      }
      return { action: originalTitle, dispatched: adjusted > 0, service: 'kpi', result: { criticalKpis: critical.length, adjusted }, executedAt: now };
    }

    const atRisk = await this.prisma.companyKPI.findMany({ where: { companyId, status: 'AT_RISK' }, take: 5 });
    if (atRisk.length > 0) {
      await this.prisma.operationalAlert.create({
        data: {
          companyId,
          category: 'KPI_FOCUS',
          severity: 'CRITICAL',
          title: `OODA: Focus on ${atRisk.length} at-risk KPIs`,
          description: `KPIs needing attention: ${atRisk.map(k => k.name).join(', ')}`,
          status: 'ACTIVE',
        },
      });
    }
    return { action: originalTitle, dispatched: atRisk.length > 0, service: 'kpi', result: { atRiskKpis: atRisk.length, alertCreated: atRisk.length > 0 }, executedAt: now };
  }

  private async pursueOpportunities(companyId: string, originalTitle: string, now: string): Promise<ActionResult> {
    const opps = await this.prisma.companyOpportunity.findMany({
      where: { companyId, status: 'IDENTIFIED' },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    for (const opp of opps) {
      await this.prisma.companyOpportunity.update({ where: { id: opp.id }, data: { status: 'ACTIONED' } });
    }
    return { action: originalTitle, dispatched: opps.length > 0, service: 'opportunity', result: { activated: opps.length }, executedAt: now };
  }
}
