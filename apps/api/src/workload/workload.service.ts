import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatus, TaskPriority } from '@prisma/client';

export interface WorkloadMetrics {
  activeTasks: number;
  urgentTasks: number;
  estimatedWorkload: number;
  capacity: number;
  utilization: number;
}

@Injectable()
export class WorkloadService {
  private readonly DEFAULT_CAPACITY = 20;

  constructor(private prisma: PrismaService) {}

  async calculateEmployeeWorkload(employeeId: string): Promise<WorkloadMetrics> {
    const tasks = await this.prisma.task.findMany({
      where: {
        assignedEmployeeId: employeeId,
        status: { in: [TaskStatus.READY, TaskStatus.IN_PROGRESS, TaskStatus.REVIEW, TaskStatus.BACKLOG] }
      }
    });

    const activeTasks = tasks.length;
    const urgentTasks = tasks.filter(t => t.priority === TaskPriority.URGENT).length;
    const estimatedWorkload = tasks.reduce((sum, t) => sum + t.estimatedEffort, 0);
    const capacity = this.DEFAULT_CAPACITY;
    const utilization = capacity > 0 ? Math.round((estimatedWorkload / capacity) * 100) : 0;

    return {
      activeTasks,
      urgentTasks,
      estimatedWorkload,
      capacity,
      utilization
    };
  }
}
