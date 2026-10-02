import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesAuditService } from './sales-audit.service';

export const SALES_AGENT_ROLES = [
  'MARKET_RESEARCH_AGENT',
  'PROSPECTING_AGENT',
  'QUALIFICATION_AGENT',
  'SALES_RESEARCH_AGENT',
  'OUTREACH_AGENT',
  'ACCOUNT_MANAGER_AGENT',
  'PROPOSAL_AGENT',
  'SALES_MANAGER_AGENT',
] as const;

export type SalesAgentRole = typeof SALES_AGENT_ROLES[number];

// Explicit permission sets per role — granted at configuration time by a human
const ROLE_DEFAULT_PERMISSIONS: Record<SalesAgentRole, string[]> = {
  MARKET_RESEARCH_AGENT: ['VIEW_SALES_LEADS', 'VIEW_TARGET_ACCOUNTS', 'VIEW_PIPELINE_METRICS'],
  PROSPECTING_AGENT: ['VIEW_SALES_LEADS', 'LOG_SALES_ACTIVITY', 'GENERATE_QUALIFICATION_ASSESSMENT'],
  QUALIFICATION_AGENT: ['VIEW_SALES_LEADS', 'GENERATE_QUALIFICATION_ASSESSMENT', 'LOG_SALES_ACTIVITY'],
  SALES_RESEARCH_AGENT: ['VIEW_SALES_LEADS', 'VIEW_TARGET_ACCOUNTS', 'VIEW_OPPORTUNITIES'],
  OUTREACH_AGENT: ['VIEW_SALES_LEADS', 'LOG_SALES_ACTIVITY', 'DRAFT_OUTREACH_MESSAGE'],
  ACCOUNT_MANAGER_AGENT: ['VIEW_OPPORTUNITIES', 'LOG_SALES_ACTIVITY', 'VIEW_PIPELINE_METRICS'],
  PROPOSAL_AGENT: ['VIEW_OPPORTUNITIES', 'VIEW_SALES_LEADS', 'LOG_SALES_ACTIVITY'],
  SALES_MANAGER_AGENT: ['VIEW_PIPELINE_METRICS', 'VIEW_OPPORTUNITIES', 'GENERATE_SALES_RECOMMENDATION'],
};

// Permissions NO agent role can ever have (governance boundary)
const FORBIDDEN_AGENT_PERMISSIONS = [
  'MARK_OPPORTUNITY_WON',
  'APPROVE_CONTRACT',
  'IMPERSONATE_CHAIRMAN',
  'BYPASS_APPROVAL',
  'GRANT_PRODUCTION_ACCESS',
];

@Injectable()
export class SalesAgentConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  async configureSalesAgent(
    companyId: string,
    grantedById: string,
    employeeId: string,
    agentRole: SalesAgentRole,
    customPermissions?: string[],
  ) {
    // Only human employees can grant sales agent configs
    const grantor = await this.prisma.employee.findUnique({
      where: { id: grantedById },
      include: { role: true },
    });
    if (!grantor || grantor.companyId !== companyId) {
      throw new ForbiddenException('Grantor does not belong to company');
    }
    if (grantor.status !== 'ACTIVE') {
      throw new ForbiddenException('Grantor is not an active employee');
    }

    const targetEmployee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!targetEmployee || targetEmployee.companyId !== companyId) {
      throw new ForbiddenException('Target employee does not belong to company');
    }

    if (!SALES_AGENT_ROLES.includes(agentRole)) {
      throw new BadRequestException(`Unknown sales agent role: ${agentRole}`);
    }

    const permissions = customPermissions ?? ROLE_DEFAULT_PERMISSIONS[agentRole];

    // Reject forbidden permissions
    for (const p of permissions) {
      if (FORBIDDEN_AGENT_PERMISSIONS.includes(p)) {
        throw new ForbiddenException(`Permission ${p} cannot be granted to any AI agent`);
      }
    }

    const config = await this.prisma.salesAgentConfig.upsert({
      where: { employeeId },
      create: {
        companyId,
        employeeId,
        agentRole,
        permissions,
        grantedById,
        isActive: true,
      },
      update: {
        agentRole,
        permissions,
        grantedById,
        isActive: true,
      },
    });

    await this.audit.record({
      companyId, actorId: grantedById,
      action: 'SALES_AGENT_CONFIG_GRANTED',
      objectType: 'SalesAgentConfig', objectId: config.id,
      newValue: { agentRole, permissions },
    });

    return config;
  }

  async checkAgentPermission(
    companyId: string,
    employeeId: string,
    requiredPermission: string,
  ): Promise<void> {
    const config = await this.prisma.salesAgentConfig.findUnique({ where: { employeeId } });

    if (!config || !config.isActive || config.companyId !== companyId) {
      throw new ForbiddenException('No active sales agent configuration found for employee');
    }

    if (FORBIDDEN_AGENT_PERMISSIONS.includes(requiredPermission)) {
      throw new ForbiddenException(`Permission ${requiredPermission} is never available to AI agents`);
    }

    const permissions = Array.isArray(config.permissions) ? (config.permissions as string[]) : [];
    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException(
        `Sales agent lacks required permission: ${requiredPermission}`,
      );
    }
  }

  async isChairman(actorId: string): Promise<boolean> {
    const chairman = await this.prisma.chairman.findUnique({ where: { id: actorId } });
    return chairman !== null;
  }

  async getAgentConfig(companyId: string, employeeId: string) {
    const config = await this.prisma.salesAgentConfig.findUnique({ where: { employeeId } });
    if (!config || config.companyId !== companyId) {
      throw new NotFoundException('Sales agent configuration not found');
    }
    return config;
  }
}
