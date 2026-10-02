import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResearchProjectService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectsByCompany(companyId: string) {
    return this.prisma.researchProject.findMany({
      where: { companyId },
      include: { owner: true, experiments: true },
    });
  }

  async getProject(projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      include: { owner: true, experiments: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async startProject(projectId: string) {
    return this.prisma.researchProject.update({
      where: { id: projectId },
      data: { status: 'ACTIVE', startDate: new Date() },
    });
  }

  async updateProjectBudget(projectId: string, newBudget: number) {
    return this.prisma.researchProject.update({
      where: { id: projectId },
      data: { budget: newBudget },
    });
  }
}
