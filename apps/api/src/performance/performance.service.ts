import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PerformanceService {
  constructor(private prisma: PrismaService) {}

  async getPerformance(employeeId: string) {
    let perf = await this.prisma.employeePerformance.findUnique({ where: { employeeId } });
    if (!perf) {
      perf = await this.prisma.employeePerformance.create({ data: { employeeId } });
    }
    return perf;
  }

  async recordTaskCompleted(employeeId: string, isLate: boolean) {
    const perf = await this.getPerformance(employeeId);
    
    // Deterministic metrics calculation
    const newCompleted = perf.tasksCompleted + 1;
    const newLate = isLate ? perf.tasksLate + 1 : perf.tasksLate;
    
    // Simple quality score based on late ratio
    const lateRatio = newCompleted > 0 ? newLate / newCompleted : 0;
    const qualityScore = Math.max(0, Math.round(100 - (lateRatio * 100)));
    const productivityScore = Math.min(100, perf.productivityScore + 2); // Goes up when completing tasks

    return this.prisma.employeePerformance.update({
      where: { id: perf.id },
      data: {
        tasksCompleted: newCompleted,
        tasksLate: newLate,
        qualityScore,
        productivityScore
      }
    });
  }
}
