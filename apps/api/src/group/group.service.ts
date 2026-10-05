import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanyStatus } from '@prisma/client';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  async createGroup(name: string, description: string, chairmanId: string) {
    return this.prisma.aevoraGroup.create({
      data: {
        name,
        description,
        chairmanId,
        status: CompanyStatus.ACTIVE,
      },
    });
  }

  async getGroup(id: string) {
    const group = await this.prisma.aevoraGroup.findUnique({
      where: { id },
      include: { companies: true },
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async listGroups(chairmanId?: string) {
    return this.prisma.aevoraGroup.findMany({
      where: chairmanId ? { chairmanId } : undefined,
      include: { companies: true },
    });
  }

  async updateGroup(id: string, updates: { name?: string; description?: string }) {
    return this.prisma.aevoraGroup.update({
      where: { id },
      data: updates,
    });
  }

  async getGroupReport(id: string, chairmanId: string) {
    const group = await this.prisma.aevoraGroup.findFirst({
      where: { id, chairmanId },
      include: { companies: true },
    });
    if (!group) throw new NotFoundException('Group not found');

    const companyIds = group.companies.map(c => c.id);

    // Aggregate basic operating state across all companies
    const states = await this.prisma.simulationState.findMany({
      where: { companyId: { in: companyIds } }
    });

    const activeProjects = await this.prisma.project.count({
      where: { companyId: { in: companyIds }, status: 'ACTIVE' }
    });

    const totalEmployees = await this.prisma.employee.count({
      where: { companyId: { in: companyIds }, status: 'ACTIVE' }
    });

    return {
      groupName: group.name,
      companyCount: group.companies.length,
      companies: group.companies.map(c => {
        const state = states.find(s => s.companyId === c.id);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          simulationTime: state?.simulationTime,
        };
      }),
      aggregate: {
        activeProjects,
        totalEmployees,
      }
    };
  }
}
