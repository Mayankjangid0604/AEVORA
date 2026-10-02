import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoalStatus, TaskPriority } from '@prisma/client';

@Injectable()
export class GoalService {
  constructor(private prisma: PrismaService) {}

  async createGoal(data: { companyId: string, employeeId?: string, departmentId?: string, title: string, description?: string, priority?: TaskPriority, dueAt?: Date }) {
    return this.prisma.$transaction(async (tx) => {
      const goal = await tx.goal.create({
        data: {
          companyId: data.companyId,
          employeeId: data.employeeId,
          departmentId: data.departmentId,
          title: data.title,
          description: data.description,
          priority: data.priority,
          dueAt: data.dueAt,
        }
      });
      await tx.companyEvent.create({
        data: { companyId: data.companyId, type: 'GOAL_CREATED', payload: { goalId: goal.id, title: goal.title } }
      });
      return goal;
    });
  }

  async getGoal(id: string) {
    const goal = await this.prisma.goal.findUnique({ where: { id }, include: { tasks: true } });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async updateProgress(id: string, progress: number) {
    return this.prisma.goal.update({ where: { id }, data: { progress: Math.min(100, Math.max(0, progress)) } });
  }

  async completeGoal(id: string) {
    const goal = await this.getGoal(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goal.update({
        where: { id },
        data: { status: GoalStatus.COMPLETED, progress: 100, completedAt: new Date() }
      });
      await tx.companyEvent.create({
        data: { companyId: goal.companyId, type: 'GOAL_COMPLETED', payload: { goalId: id } }
      });
      return updated;
    });
  }

  async pauseGoal(id: string) {
    return this.prisma.goal.update({ where: { id }, data: { status: GoalStatus.PAUSED } });
  }

  async listEmployeeGoals(employeeId: string) {
    return this.prisma.goal.findMany({ where: { employeeId } });
  }
}
