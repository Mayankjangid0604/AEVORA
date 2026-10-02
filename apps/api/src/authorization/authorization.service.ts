import { Injectable, ForbiddenException } from '@nestjs/common';
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
}
