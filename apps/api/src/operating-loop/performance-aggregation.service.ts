import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Company-wide agent performance aggregation.
 * Provides agent-level and company-level performance views with rankings.
 */
@Injectable()
export class PerformanceAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyPerformance(companyId: string) {
    const agents = await this.prisma.employeePerformance.findMany({
      where: { employee: { companyId } },
      include: {
        employee: {
          select: { id: true, name: true, status: true, department: { select: { name: true } }, role: { select: { title: true } } },
        },
      },
    });

    const ranked = agents
      .map(a => ({
        employeeId: a.employee.id,
        name: a.employee.name,
        department: a.employee.department?.name,
        role: a.employee.role?.title,
        status: a.employee.status,
        tasksCompleted: a.tasksCompleted,
        tasksLate: a.tasksLate,
        tasksBlocked: a.tasksBlocked,
        qualityScore: a.qualityScore,
        productivityScore: a.productivityScore,
        successRate: a.tasksCompleted > 0 ? Math.round(((a.tasksCompleted - a.tasksLate) / a.tasksCompleted) * 100) : 0,
      }))
      .sort((a, b) => b.qualityScore - a.qualityScore);

    const total = ranked.length;
    const avgQuality = total > 0 ? Math.round(ranked.reduce((s, a) => s + a.qualityScore, 0) / total) : 0;
    const avgProductivity = total > 0 ? Math.round(ranked.reduce((s, a) => s + a.productivityScore, 0) / total) : 0;
    const totalCompleted = ranked.reduce((s, a) => s + a.tasksCompleted, 0);
    const totalLate = ranked.reduce((s, a) => s + a.tasksLate, 0);

    return {
      summary: { totalAgents: total, avgQuality, avgProductivity, totalTasksCompleted: totalCompleted, totalTasksLate: totalLate, companySuccessRate: totalCompleted > 0 ? Math.round(((totalCompleted - totalLate) / totalCompleted) * 100) : 0 },
      agents: ranked,
    };
  }

  async getAgentPerformance(employeeId: string) {
    const perf = await this.prisma.employeePerformance.findUnique({
      where: { employeeId },
      include: { employee: { select: { name: true, department: { select: { name: true } } } } },
    });
    if (!perf) return null;

    const evaluations = await this.prisma.performanceEvaluation.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { overallScore: true, strengths: true, weaknesses: true, createdAt: true },
    });

    return {
      ...perf,
      successRate: perf.tasksCompleted > 0 ? Math.round(((perf.tasksCompleted - perf.tasksLate) / perf.tasksCompleted) * 100) : 0,
      evaluations,
    };
  }
}
