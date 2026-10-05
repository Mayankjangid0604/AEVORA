import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Permissions allowed for Phase 25 agents
export const PHASE25_ALLOWED_PERMISSIONS = [
  'INSPECT_PROJECT',
  'INSPECT_TASKS',
  'INSPECT_DEPENDENCIES',
  'PROPOSE_TASK_DECOMPOSITION',
  'PROPOSE_STAFFING',
  'IDENTIFY_RISKS',
  'RECOMMEND_SCHEDULE',
  'SUMMARIZE_PROJECT_HEALTH',
  'PROPOSE_NEXT_ACTIONS',
  'MONITOR_CUSTOMER_HEALTH',
  'IDENTIFY_RISKS',
  'SUMMARIZE_CUSTOMER_ACTIVITY',
  'IDENTIFY_OVERDUE_ITEMS',
  'RECOMMEND_FOLLOWUPS',
  'IDENTIFY_RENEWAL_OPPORTUNITIES',
  'DRAFT_COMMUNICATIONS',
  'MONITOR_PROJECT_PORTFOLIO',
  'DETECT_BLOCKED_PROJECTS',
  'IDENTIFY_STAFFING_CONFLICTS',
  'IDENTIFY_OVERDUE_TASKS',
  'RECOMMEND_RESOURCE_CHANGES',
  'RECOMMEND_ESCALATION',
  'SUMMARIZE_OPERATIONAL_KPIS',
] as const;

// Permissions that are ABSOLUTELY FORBIDDEN for AI agents in Phase 25
export const PHASE25_FORBIDDEN_PERMISSIONS = [
  'APPROVE_CONTRACT',
  'APPROVE_PAYMENT',
  'FABRICATE_CUSTOMER_ACCEPTANCE',
  'BYPASS_APPROVAL',
  'GRANT_PERMISSIONS',
  'IMPERSONATE_CHAIRMAN',
  'MODIFY_FINANCIAL_AUTHORITY',
  'MARK_OPPORTUNITY_WON',
  'ISSUE_INVOICE',
  'AUTHORIZE_DELIVERY',
  'OVERRIDE_GOVERNANCE',
] as const;

export interface AgentRecommendation {
  agentId: string;
  companyId: string;
  recommendationType: string;
  subject: string;
  recommendation: string;
  rationale: string;
  confidence: number;
  affectedEntities: string[];
}

@Injectable()
export class Phase25AgentService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyAgentPermission(employeeId: string, companyId: string, requiredPermission: string): Promise<void> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw new ForbiddenException('Agent employee not found or wrong company');
    }

    const salesConfig = await this.prisma.salesAgentConfig.findUnique({ where: { employeeId } });
    if (!salesConfig || !salesConfig.isActive) {
      throw new ForbiddenException('Agent not configured or inactive');
    }

    const permissions: string[] = Array.isArray(salesConfig.permissions) ? salesConfig.permissions as string[] : [];

    // Forbidden check
    if ((PHASE25_FORBIDDEN_PERMISSIONS as readonly string[]).includes(requiredPermission)) {
      throw new ForbiddenException(`Permission ${requiredPermission} is forbidden for AI agents`);
    }

    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException(`Agent does not have permission: ${requiredPermission}`);
    }
  }

  async proposeProjectPlan(
    projectId: string,
    companyId: string,
    agentEmployeeId: string,
  ): Promise<AgentRecommendation> {
    await this.verifyAgentPermission(agentEmployeeId, companyId, 'PROPOSE_TASK_DECOMPOSITION');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { tasks: true, requirements: true, client: true },
    });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }

    const taskCount = project.tasks.length;
    const reqCount = project.requirements.length;
    const recommendation = taskCount === 0
      ? `Project "${project.name}" has no tasks. Recommend decomposing ${reqCount} requirement(s) into ${Math.max(reqCount * 2, 5)} tasks.`
      : `Project "${project.name}" has ${taskCount} task(s). Consider reviewing task dependencies and estimates.`;

    return {
      agentId: agentEmployeeId,
      companyId,
      recommendationType: 'PROJECT_PLAN',
      subject: `Project plan for ${project.name}`,
      recommendation,
      rationale: `Based on ${reqCount} requirement(s) and ${taskCount} existing task(s)`,
      confidence: 70,
      affectedEntities: [projectId],
    };
  }

  async summarizeProjectHealth(
    projectId: string,
    companyId: string,
    agentEmployeeId: string,
  ): Promise<AgentRecommendation> {
    await this.verifyAgentPermission(agentEmployeeId, companyId, 'SUMMARIZE_PROJECT_HEALTH');

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        tasks: true,
        risks: { where: { status: 'OPEN' } },
        assignments: { where: { status: 'ACTIVE' } },
      },
    });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project not found or access denied');
    }

    const blocked = project.tasks.filter(t => t.status === 'BLOCKED').length;
    const openRisks = project.risks.length;
    const staffed = project.assignments.length;
    const summary = `Project is ${project.status}. ${blocked} blocked tasks, ${openRisks} open risks, ${staffed} active staff.`;

    return {
      agentId: agentEmployeeId,
      companyId,
      recommendationType: 'HEALTH_SUMMARY',
      subject: `Health summary for project ${project.name}`,
      recommendation: summary,
      rationale: 'Observed from current project state',
      confidence: 90,
      affectedEntities: [projectId],
    };
  }

  async identifyCustomerRisks(
    clientId: string,
    companyId: string,
    agentEmployeeId: string,
  ): Promise<AgentRecommendation> {
    await this.verifyAgentPermission(agentEmployeeId, companyId, 'MONITOR_CUSTOMER_HEALTH');

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        projects: {
          where: { companyId },
          include: { tasks: true },
        },
        Invoice: { where: { companyId } },
      },
    });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }

    const overdueInvoices = client.Invoice.filter(inv => inv.status === 'OVERDUE').length;
    const blockedProjects = client.projects.filter(p => p.status === 'BLOCKED').length;
    const risks: string[] = [];
    if (overdueInvoices > 0) risks.push(`${overdueInvoices} overdue invoice(s)`);
    if (blockedProjects > 0) risks.push(`${blockedProjects} blocked project(s)`);

    return {
      agentId: agentEmployeeId,
      companyId,
      recommendationType: 'CUSTOMER_RISK',
      subject: `Risk assessment for ${client.name}`,
      recommendation: risks.length > 0 ? `Detected: ${risks.join(', ')}` : 'No immediate risks detected',
      rationale: 'Observed from invoices and project status',
      confidence: 80,
      affectedEntities: [clientId],
    };
  }

  async draftCommunication(
    clientId: string,
    companyId: string,
    agentEmployeeId: string,
    intent: string,
  ) {
    await this.verifyAgentPermission(agentEmployeeId, companyId, 'DRAFT_COMMUNICATIONS');

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }

    // Return a draft — the draft requires human approval before being sent
    return {
      agentId: agentEmployeeId,
      companyId,
      clientId,
      intent,
      draft: `Dear ${client.name},\n\n[AI-drafted content for intent: ${intent}]\n\nBest regards`,
      status: 'DRAFT',
      requiresApproval: true,
      note: 'This is an AI draft. It must be reviewed and approved before sending.',
    };
  }

  async detectOperationalAlerts(companyId: string, agentEmployeeId: string) {
    await this.verifyAgentPermission(agentEmployeeId, companyId, 'MONITOR_PROJECT_PORTFOLIO');

    const blockedProjects = await this.prisma.project.findMany({
      where: { companyId, status: 'BLOCKED' },
      include: { client: true },
    });
    const overdueProjects = await this.prisma.project.findMany({
      where: {
        companyId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'FAILED'] },
        targetEndDate: { lt: new Date() },
      },
      include: { client: true },
    });

    return {
      agentId: agentEmployeeId,
      companyId,
      blockedProjects: blockedProjects.map(p => ({ id: p.id, name: p.name, client: p.client.name })),
      overdueProjects: overdueProjects.map(p => ({ id: p.id, name: p.name, client: p.client.name })),
      recommendationType: 'OPERATIONAL_ALERTS',
      note: 'AI recommendations only. No actions taken.',
    };
  }

  async tryForbiddenAction(permission: string): Promise<never> {
    if ((PHASE25_FORBIDDEN_PERMISSIONS as readonly string[]).includes(permission)) {
      throw new ForbiddenException(`Permission ${permission} is forbidden for AI agents`);
    }
    throw new ForbiddenException('Action not permitted');
  }
}
