import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

/** Authenticated request principal as set by JwtAuthGuard. */
export interface AuthUser { actorId: string; actorRole: string; companyId?: string }

/** Company-owned models whose rows can be addressed by id from a route. */
export type CompanyScopedModel = 'department' | 'employee' | 'task' | 'goal' | 'improvementProposal' | 'operatingLoopCycle' | 'ceoAutonomousDecision'
  | 'improvementSignal' | 'researchHypothesis' | 'experimentPlan' | 'project' | 'computeWorker';

/** Project children that carry only projectId (no companyId). */
export type ProjectChildModel = 'projectRequirement' | 'projectPlan' | 'projectAssignment' | 'projectDelivery';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthorizationService {
  constructor(private prisma: PrismaService) {}

  async checkPermission(actorId: string, requiredPermission: string, companyId: string) {
    // First, check if actor is a Chairman
    const chairman = await this.prisma.chairman.findUnique({
      where: { id: actorId },
      include: { companies: true }
    });

    if (chairman) {
      if (chairman.companies.some(c => c.id === companyId)) {
        return true; // Chairman has full access to their companies
      } else {
        throw new ForbiddenException('Chairman does not own this company');
      }
    }

    const emp = await this.prisma.employee.findUnique({
      where: { id: actorId },
      include: { role: true }
    });

    if (!emp || emp.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to this company');
    }

    if (emp.role.accessLevel === 'SYSTEM') return true;


    if (emp.role.permissions && Array.isArray(emp.role.permissions)) {
      if ((emp.role.permissions as string[]).includes(requiredPermission)) {
        return true;
      }
    }

    throw new ForbiddenException(`Missing required permission: ${requiredPermission}`);
  }

  /** Companies the authenticated actor may access: a Chairman's owned companies, otherwise the token's company. */
  async accessibleCompanies(user: AuthUser) {
    if (!user?.actorId) throw new ForbiddenException('Authentication context missing');
    if (user.actorRole === 'CHAIRMAN') {
      return this.prisma.company.findMany({ where: { chairmanId: user.actorId }, orderBy: { createdAt: 'asc' } });
    }
    if (!user.companyId) return [];
    return this.prisma.company.findMany({ where: { id: user.companyId } });
  }

  /** Throws 403 unless the authenticated actor may access companyId (ids from URL/body are never trusted). */
  async assertCompanyAccess(user: AuthUser, companyId: string): Promise<void> {
    if (!user?.actorId || typeof companyId !== 'string' || !companyId) {
      throw new ForbiddenException('You do not have access to this company');
    }
    if (user.actorRole === 'CHAIRMAN') {
      const owned = await this.prisma.company.findFirst({ where: { id: companyId, chairmanId: user.actorId }, select: { id: true } });
      if (owned) return;
    } else if (user.companyId === companyId) {
      return;
    }
    throw new ForbiddenException('You do not have access to this company');
  }

  /**
   * Resolves the owning company of a row addressed by id and asserts access to it.
   * A row in another tenant is reported as 404 so ids cannot be probed across companies.
   */
  async assertResourceAccess(user: AuthUser, model: CompanyScopedModel, id: string): Promise<string> {
    const isProject = model === 'project';
    const row = typeof id === 'string' && id
      ? await (this.prisma[model] as any).findUnique({
          where: { id },
          select: isProject ? { companyId: true, clientId: true } : { companyId: true },
        })
      : null;
    if (!row) throw new NotFoundException('Resource not found');
    try {
      await this.assertCompanyAccess(user, row.companyId);
    } catch {
      throw new NotFoundException('Resource not found');
    }
    if (isProject && user.actorRole === 'CLIENT') {
      if (!row.clientId || row.clientId !== user.actorId) {
        throw new ForbiddenException('Client is not authorized for this project');
      }
    }
    return row.companyId;
  }

  /**
   * Resolves a ProjectDelivery, validates company access, and for CLIENT actors,
   * ensures the authenticated client is assigned to the parent project.
   * Returns verified delivery and parent project metadata.
   */
  async assertDeliveryClientAccess(
    user: AuthUser,
    deliveryId: string,
  ): Promise<{ projectId: string; companyId: string; clientId: string }> {
    if (!user?.actorId || typeof deliveryId !== 'string' || !deliveryId) {
      throw new NotFoundException('Resource not found');
    }
    const delivery = await this.prisma.projectDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            id: true,
            companyId: true,
            clientId: true,
          },
        },
      },
    });

    const projectId = delivery?.projectId || delivery?.project?.id;
    let project = delivery?.project;

    if (!project && projectId) {
      project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, companyId: true, clientId: true },
      });
    }

    if (!delivery || !project) {
      throw new NotFoundException('Resource not found');
    }

    try {
      await this.assertCompanyAccess(user, project.companyId);
    } catch {
      throw new NotFoundException('Resource not found');
    }

    if (user.actorRole === 'CLIENT') {
      if (!project.clientId || project.clientId !== user.actorId) {
        throw new ForbiddenException('Client is not authorized for this project delivery');
      }
    }

    return {
      projectId,
      companyId: project.companyId,
      clientId: project.clientId,
    };
  }

  /** Throws 403 unless the authenticated Chairman owns the group. */
  async assertGroupOwnership(user: AuthUser, groupId: string): Promise<void> {
    const owned = user?.actorRole === 'CHAIRMAN' && typeof groupId === 'string'
      ? await this.prisma.aevoraGroup.findFirst({ where: { id: groupId, chairmanId: user.actorId }, select: { id: true } })
      : null;
    if (!owned) throw new ForbiddenException('You do not have access to this group');
  }

  /** A role may be assigned in a company only if it is that company's role or a global template (companyId null). */
  async assertRoleUsable(companyId: string, roleId: string): Promise<void> {
    const role = typeof roleId === 'string' && roleId
      ? await this.prisma.role.findUnique({ where: { id: roleId }, select: { companyId: true } })
      : null;
    if (!role || (role.companyId !== null && role.companyId !== companyId)) {
      throw new BadRequestException('Role is not available in this company');
    }
  }

  /** Resolves a project child row to its project, then applies the project's company check (404 if missing/foreign). */
  async assertProjectChildAccess(user: AuthUser, model: ProjectChildModel, id: string): Promise<string> {
    const row = typeof id === 'string' && id
      ? await (this.prisma[model] as any).findUnique({ where: { id }, select: { projectId: true } })
      : null;
    if (!row) throw new NotFoundException('Resource not found');
    await this.assertResourceAccess(user, 'project', row.projectId);
    return row.projectId;
  }

  /** Agents have no companyId; ownership is the agent's employee's company. Missing/foreign -> 404. */
  async assertAgentAccess(user: AuthUser, agentId: string): Promise<string> {
    const agent = typeof agentId === 'string' && agentId
      ? await this.prisma.agent.findUnique({ where: { id: agentId }, select: { employee: { select: { companyId: true } } } })
      : null;
    if (!agent) throw new NotFoundException('Resource not found');
    try {
      await this.assertCompanyAccess(user, agent.employee.companyId);
    } catch {
      throw new NotFoundException('Resource not found');
    }
    return agent.employee.companyId;
  }

  /** Training jobs belong to the company of their training run. Missing/foreign -> 404. */
  async assertTrainingJobAccess(user: AuthUser, jobId: string): Promise<void> {
    const job = typeof jobId === 'string' && jobId
      ? await this.prisma.trainingJob.findUnique({ where: { id: jobId }, select: { trainingRun: { select: { companyId: true } } } })
      : null;
    if (!job) throw new NotFoundException('Resource not found');
    try {
      await this.assertCompanyAccess(user, job.trainingRun.companyId);
    } catch {
      throw new NotFoundException('Resource not found');
    }
  }
}
