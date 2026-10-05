import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

/** Authenticated request principal as set by JwtAuthGuard. */
export interface AuthUser { actorId: string; actorRole: string; companyId?: string }

/** Company-owned models whose rows can be addressed by id from a route. */
export type CompanyScopedModel = 'department' | 'employee' | 'task' | 'goal' | 'improvementProposal' | 'operatingLoopCycle' | 'ceoAutonomousDecision';
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
    const row = typeof id === 'string' && id
      ? await (this.prisma[model] as any).findUnique({ where: { id }, select: { companyId: true } })
      : null;
    if (!row) throw new NotFoundException('Resource not found');
    try {
      await this.assertCompanyAccess(user, row.companyId);
    } catch {
      throw new NotFoundException('Resource not found');
    }
    return row.companyId;
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
}
