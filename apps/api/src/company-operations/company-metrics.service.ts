import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompanyMetricsService {
  private readonly logger = new Logger(CompanyMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCompanyMetrics(companyId: string) {
    const activeEmployees = await this.prisma.employee.count({
      where: { companyId, status: 'ACTIVE' },
    });

    const activeProjects = await this.prisma.project.count({
      where: { companyId, status: 'ACTIVE' },
    });

    const tasksCompleted = await this.prisma.task.count({
      where: { companyId, status: 'COMPLETED' },
    });

    const tasksOverdue = await this.prisma.task.count({
      where: {
        companyId,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        dueAt: { lt: new Date() },
      },
    });

    const tasksBlocked = await this.prisma.task.count({
      where: { companyId, status: 'BLOCKED' },
    });

    const projectRisks = await this.prisma.projectRisk.count({
      where: { project: { companyId }, status: 'OPEN' },
    });

    return {
      activeEmployees,
      activeProjects,
      tasksCompleted,
      tasksOverdue,
      tasksBlocked,
      projectRisks,
    };
  }

  async getDepartmentMetrics(departmentId: string) {
    const activeEmployees = await this.prisma.employee.count({
      where: { departmentId, status: 'ACTIVE' },
    });

    const tasksCompleted = await this.prisma.task.count({
      where: { assignedEmployee: { departmentId }, status: 'COMPLETED' },
    });

    const tasksBlocked = await this.prisma.task.count({
      where: { assignedEmployee: { departmentId }, status: 'BLOCKED' },
    });

    return {
      activeEmployees,
      tasksCompleted,
      tasksBlocked,
    };
  }
}
