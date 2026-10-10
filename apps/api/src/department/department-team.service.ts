import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentTeamStatus, EmployeeStatus } from '@prisma/client';

export interface FormTeamDto {
  departmentId: string;
  workstreamId?: string;
  name: string;
  formationReason: string;
  expectedOutcome: string;
  requiredCapabilities: string[];
  memberAgentIds: string[];
  leadAgentId: string;
  authorityScope?: {
    maxTaskRiskTier?: string;
    canDelegate?: boolean;
    allowedCapabilities?: string[];
  };
  terminationCondition?: string;
  correlationId?: string;
  causationId?: string;
}

@Injectable()
export class DepartmentTeamService {
  private readonly logger = new Logger(DepartmentTeamService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Forms a controlled, temporary AI team for complex multi-capability department initiatives.
   * Enforces:
   * 1. AI-only members (all members are active AI agents in company)
   * 2. Strict company isolation
   * 3. Bounded authority (subordinate to Department, CEO, Chairman)
   * 4. Explicit explainability (formationReason, expectedOutcome, terminationCondition)
   */
  async formTeam(companyId: string, dto: FormTeamDto) {
    if (!companyId) {
      throw new BadRequestException('Team formation requires explicit companyId');
    }

    if (!dto.name || !dto.formationReason || !dto.leadAgentId) {
      throw new BadRequestException('Team formation requires name, formationReason, and leadAgentId');
    }

    if (!Array.isArray(dto.memberAgentIds) || dto.memberAgentIds.length === 0) {
      throw new BadRequestException('Team must include at least one member agent');
    }

    // 1. Verify Department exists in company
    const department = await this.prisma.department.findFirst({
      where: { id: dto.departmentId, companyId },
    });
    if (!department) {
      throw new NotFoundException(`Department ${dto.departmentId} not found in company ${companyId}`);
    }

    // 2. Verify all member agents are active AI employees in the company
    const allAgentIds = Array.from(new Set([dto.leadAgentId, ...dto.memberAgentIds]));
    const verifiedEmployees = await this.prisma.employee.findMany({
      where: {
        id: { in: allAgentIds },
        companyId,
        status: EmployeeStatus.ACTIVE,
      },
    });

    if (verifiedEmployees.length !== allAgentIds.length) {
      const foundIds = new Set(verifiedEmployees.map((e) => e.id));
      const missingOrInvalid = allAgentIds.filter((id) => !foundIds.has(id));
      throw new ForbiddenException(
        `Cross-company or invalid workforce members detected: ${missingOrInvalid.join(', ')}`,
      );
    }

    // 3. Verify workstream if provided
    if (dto.workstreamId) {
      const workstream = await this.prisma.departmentWorkstream.findFirst({
        where: { id: dto.workstreamId, companyId },
      });
      if (!workstream) {
        throw new NotFoundException(`Workstream ${dto.workstreamId} not found in company ${companyId}`);
      }
    }

    const defaultAuthorityScope = {
      maxTaskRiskTier: 'MEDIUM',
      canDelegate: false,
      allowedCapabilities: dto.requiredCapabilities,
      ...dto.authorityScope,
    };

    const team = await this.prisma.departmentTeam.create({
      data: {
        companyId,
        departmentId: dto.departmentId,
        workstreamId: dto.workstreamId,
        name: dto.name.trim(),
        formationReason: dto.formationReason,
        expectedOutcome: dto.expectedOutcome,
        status: DepartmentTeamStatus.ACTIVE,
        leadAgentId: dto.leadAgentId,
        memberAgentIds: dto.memberAgentIds,
        requiredCapabilities: dto.requiredCapabilities || [],
        authorityScope: defaultAuthorityScope,
        terminationCondition: dto.terminationCondition || 'On completion of assigned workstream tasks',
        correlationId: dto.correlationId,
        causationId: dto.causationId,
      },
      include: {
        department: true,
        workstream: true,
      },
    });

    // Authoritative CompanyEvent
    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'DEPARTMENT_TEAM_FORMED',
        payload: {
          teamId: team.id,
          name: team.name,
          departmentId: team.departmentId,
          leadAgentId: team.leadAgentId,
          memberCount: dto.memberAgentIds.length,
          formationReason: team.formationReason,
          authorityScope: defaultAuthorityScope,
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit DEPARTMENT_TEAM_FORMED event: ${e.message}`));

    this.logger.log(
      `[DepartmentTeam] Formed temporary team "${team.name}" (${team.id}) with ${dto.memberAgentIds.length} agents in department ${department.name}`,
    );

    return team;
  }

  /**
   * Retrieves a team with company isolation.
   */
  async getTeam(teamId: string, companyId: string) {
    const team = await this.prisma.departmentTeam.findFirst({
      where: { id: teamId, companyId },
      include: {
        department: true,
        workstream: true,
      },
    });

    if (!team) {
      throw new NotFoundException(`Department team ${teamId} not found in company ${companyId}`);
    }

    return team;
  }

  /**
   * Lists active or all teams in a department.
   */
  async listDepartmentTeams(departmentId: string, companyId: string) {
    return this.prisma.departmentTeam.findMany({
      where: { departmentId, companyId },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Dissolves a temporary AI team upon objective completion or explicit trigger.
   * Prevents permanent organizational debris.
   */
  async dissolveTeam(teamId: string, companyId: string, reason: string) {
    const team = await this.prisma.departmentTeam.findFirst({
      where: { id: teamId, companyId },
    });

    if (!team) {
      throw new NotFoundException(`Department team ${teamId} not found in company ${companyId}`);
    }

    const updated = await this.prisma.departmentTeam.update({
      where: { id: teamId },
      data: {
        status: DepartmentTeamStatus.DISSOLVED,
        endedAt: new Date(),
      },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'DEPARTMENT_TEAM_DISSOLVED',
        payload: {
          teamId,
          name: team.name,
          departmentId: team.departmentId,
          reason,
          durationMs: Date.now() - new Date(team.startedAt).getTime(),
        },
      },
    }).catch((e) => this.logger.error(`Failed to emit DEPARTMENT_TEAM_DISSOLVED event: ${e.message}`));

    this.logger.log(`[DepartmentTeam] Dissolved team "${team.name}" (${teamId}). Reason: ${reason}`);

    return updated;
  }

  /**
   * Verifies that an action requested by a team is within its bounded authority scope.
   * Prevents recursive or unauthorized authority expansion.
   */
  async verifyTeamAuthority(
    teamId: string,
    companyId: string,
    action: { riskTier?: string; capability?: string },
  ): Promise<{ allowed: boolean; reason?: string }> {
    const team = await this.prisma.departmentTeam.findFirst({
      where: { id: teamId, companyId },
    });

    if (!team) {
      return { allowed: false, reason: 'Team not found' };
    }

    if (team.status !== DepartmentTeamStatus.ACTIVE) {
      return { allowed: false, reason: `Team is ${team.status}, not ACTIVE` };
    }

    const scope = (team.authorityScope as any) || {};
    const maxRisk = scope.maxTaskRiskTier || 'MEDIUM';

    // Disallow action if requested risk exceeds team maxRisk
    const riskLevels: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    const requestedRiskLevel = riskLevels[action.riskTier || 'LOW'] || 1;
    const maxAllowedRiskLevel = riskLevels[maxRisk] || 2;

    if (requestedRiskLevel > maxAllowedRiskLevel) {
      return {
        allowed: false,
        reason: `Requested risk tier (${action.riskTier}) exceeds team delegated authority (${maxRisk})`,
      };
    }

    return { allowed: true };
  }
}
