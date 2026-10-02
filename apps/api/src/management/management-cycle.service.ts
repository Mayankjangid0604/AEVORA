import {
  Injectable, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from './management-audit.service';
import { CompanyStateService } from './company-state.service';
import { CompanyHealthService } from './company-health.service';
import { CompanyRiskService } from './company-risk.service';
import { CompanyOpportunityService } from './company-opportunity.service';
import { EscalationService } from './escalation.service';
import { OrganizationalMemoryService } from './organizational-memory.service';
import {
  EmployeeStatus, ManagementCycleType, ManagementCycleStatus,
  RiskLevel, OpportunityType, DecisionPriority, OrgMemoryType,
} from '@prisma/client';

@Injectable()
export class ManagementCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
    private readonly stateSvc: CompanyStateService,
    private readonly healthSvc: CompanyHealthService,
    private readonly riskSvc: CompanyRiskService,
    private readonly opportunitySvc: CompanyOpportunityService,
    private readonly escalationSvc: EscalationService,
    private readonly memorySvc: OrganizationalMemoryService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  private buildIdempotencyKey(companyId: string, cycleType: ManagementCycleType): string {
    const now = new Date();
    if (cycleType === ManagementCycleType.DAILY) {
      return `${companyId}:DAILY:${now.toISOString().slice(0, 10)}`;
    } else if (cycleType === ManagementCycleType.WEEKLY) {
      // ISO week
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const week1 = new Date(d.getFullYear(), 0, 4);
      const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
      return `${companyId}:WEEKLY:${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    } else {
      return `${companyId}:MONTHLY:${now.toISOString().slice(0, 7)}`;
    }
  }

  async runCycle(companyId: string, actorId: string, cycleType: ManagementCycleType) {
    await this.verifyActor(actorId, companyId);

    const idempotencyKey = this.buildIdempotencyKey(companyId, cycleType);

    // Idempotency: prevent duplicate cycles for same period
    const existing = await this.prisma.managementCycle.findUnique({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
    });
    if (existing) {
      if (existing.status === ManagementCycleStatus.COMPLETED) {
        throw new BadRequestException(`${cycleType} cycle already completed for this period`);
      }
      if (existing.status === ManagementCycleStatus.RUNNING) {
        throw new BadRequestException(`${cycleType} cycle is already running for this period`);
      }
      // FAILED cycle: delete the failed record to allow retry
      if (existing.status === ManagementCycleStatus.FAILED) {
        await this.prisma.managementCycle.delete({ where: { id: existing.id } });
      }
    }

    // Create cycle record (RUNNING) — catch concurrent race (P2002) cleanly
    let cycle: any;
    try {
      cycle = await this.prisma.managementCycle.create({
        data: {
          companyId,
          cycleType,
          status: ManagementCycleStatus.RUNNING,
          triggeredBy: actorId,
          idempotencyKey,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(`${cycleType} cycle is already in progress for this period (concurrent request)`);
      }
      throw e;
    }

    await this.audit.record({ companyId, actorId, action: 'MANAGEMENT_CYCLE_STARTED', objectType: 'ManagementCycle', objectId: cycle.id, newValue: { cycleType }, cycleId: cycle.id });

    try {
      // Step 1: Collect company state
      const state = await this.stateSvc.collectState(companyId);

      // Step 2: Analyze health
      const healthAnalysis = this.healthSvc.analyzeHealth(state);
      await this.healthSvc.generateAndStoreSnapshot(companyId, actorId, cycle.id);

      const anomalies: string[] = [];
      let risksIdentified = 0;
      let opportunitiesFound = 0;
      let escalationsCreated = 0;

      // Step 3: Detect anomalies
      if (healthAnalysis.financialScore < 25) anomalies.push('Critical financial health');
      if (state.projects.blocked > 0) anomalies.push(`${state.projects.blocked} blocked project(s)`);
      if (state.tasks.blocked > 5) anomalies.push(`${state.tasks.blocked} blocked task(s)`);
      if (state.workforce.activeEmployees === 0) anomalies.push('No active employees');
      if (state.finance.openInvoices > 10) anomalies.push(`${state.finance.openInvoices} unpaid invoices`);

      // Step 4: Identify risks
      if (state.finance.acBalance < 500 && actorId) {
        await this.riskSvc.createRisk(companyId, actorId, {
          title: 'Critical AC balance',
          description: `AC balance is ${state.finance.acBalance}`,
          probability: RiskLevel.HIGH,
          impact: RiskLevel.HIGH,
          ownerId: actorId,
          evidence: [{ source: 'company_state', value: state.finance }],
          cycleId: cycle.id,
        });
        risksIdentified++;
      }

      if (state.projects.blocked > 0) {
        await this.riskSvc.createRisk(companyId, actorId, {
          title: 'Blocked project deliveries',
          description: `${state.projects.blocked} project(s) are blocked`,
          probability: RiskLevel.MEDIUM,
          impact: RiskLevel.HIGH,
          ownerId: actorId,
          evidence: [{ source: 'company_state', value: state.projects }],
          cycleId: cycle.id,
        });
        risksIdentified++;
      }

      // Step 5: Identify opportunities
      if (state.sales.openOpportunities > 5) {
        await this.opportunitySvc.createOpportunity(companyId, actorId, {
          title: 'Active sales pipeline opportunity',
          description: `${state.sales.openOpportunities} open opportunities ready for conversion`,
          opportunityType: OpportunityType.SALES_OPPORTUNITY,
          ownerId: actorId,
          evidence: [{ source: 'company_state', value: state.sales }],
          cycleId: cycle.id,
        });
        opportunitiesFound++;
      }

      if (state.customers.total > 0 && state.marketing.activeCampaigns === 0) {
        await this.opportunitySvc.createOpportunity(companyId, actorId, {
          title: 'No active marketing campaigns for existing customers',
          description: 'Opportunity to improve customer engagement via campaigns',
          opportunityType: OpportunityType.CUSTOMER_EXPANSION,
          ownerId: actorId,
          evidence: [{ source: 'company_state', value: { customers: state.customers, marketing: state.marketing } }],
          cycleId: cycle.id,
        });
        opportunitiesFound++;
      }

      // Step 6: Escalate critical issues
      if (healthAnalysis.status === 'CRITICAL') {
        await this.escalationSvc.createEscalation(companyId, actorId, {
          title: 'Company health is CRITICAL',
          description: 'Multiple health dimensions below critical threshold',
          reason: `Health status: CRITICAL. Reasons: ${healthAnalysis.reasons.join('; ')}`,
          evidence: [{ source: 'health_snapshot', value: healthAnalysis }],
          riskLevel: RiskLevel.CRITICAL,
          priority: DecisionPriority.CRITICAL,
          escalatedTo: 'CHAIRMAN',
          proposedAction: { action: 'EMERGENCY_REVIEW', description: 'Immediate Chairman review required' },
          expectedImpact: { severity: 'CRITICAL', description: 'Company operations at risk' },
        });
        escalationsCreated++;
      }

      // Step 7: Record organizational memory for weekly/monthly
      if (cycleType !== ManagementCycleType.DAILY) {
        await this.memorySvc.record(companyId, actorId, {
          memoryType: OrgMemoryType.LESSON,
          subject: `${cycleType} cycle summary`,
          content: `Health: ${healthAnalysis.status}. Anomalies: ${anomalies.join(', ') || 'none'}. Risks: ${risksIdentified}. Opportunities: ${opportunitiesFound}.`,
          tags: [cycleType, healthAnalysis.status],
          sourceCycleId: cycle.id,
        });
      }

      // Mark cycle COMPLETED
      const completed = await this.prisma.managementCycle.update({
        where: { id: cycle.id },
        data: {
          status: ManagementCycleStatus.COMPLETED,
          completedAt: new Date(),
          healthStatus: healthAnalysis.status,
          anomaliesDetected: anomalies as any,
          risksIdentified,
          opportunitiesFound,
          decisionsGenerated: 0,
          escalationsCreated,
          summary: { state: { workforce: state.workforce, finance: state.finance }, health: healthAnalysis.status } as any,
        },
      });

      await this.audit.record({ companyId, actorId, action: 'MANAGEMENT_CYCLE_COMPLETED', objectType: 'ManagementCycle', objectId: cycle.id, newValue: { cycleType, healthStatus: healthAnalysis.status, risksIdentified, opportunitiesFound }, cycleId: cycle.id });
      return completed;

    } catch (error) {
      await this.prisma.managementCycle.update({
        where: { id: cycle.id },
        data: { status: ManagementCycleStatus.FAILED, completedAt: new Date(), error: String(error) },
      });
      throw error;
    }
  }

  async getCycles(companyId: string, cycleType?: ManagementCycleType) {
    return this.prisma.managementCycle.findMany({
      where: { companyId, ...(cycleType ? { cycleType } : {}) },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  async getCycle(companyId: string, cycleId: string) {
    const cycle = await this.prisma.managementCycle.findUnique({ where: { id: cycleId } });
    if (!cycle || cycle.companyId !== companyId) throw new BadRequestException('Cycle not found');
    return cycle;
  }
}
