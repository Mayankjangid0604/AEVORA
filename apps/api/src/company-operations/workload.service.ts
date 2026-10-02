import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkloadService {
  private readonly logger = new Logger(WorkloadService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reassignTask(
    companyId: string,
    taskId: string,
    newAssigneeId: string,
    reassignedBy: string,
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId, companyId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: { assignedEmployeeId: newAssigneeId },
    });

    await this.prisma.companyEvent.create({
      data: {
        companyId,
        type: 'WORKLOAD_REASSIGNED',
        payload: { taskId, oldAssigneeId: task.assignedEmployeeId, newAssigneeId, reassignedBy },
      },
    });

    return updatedTask;
  }
}
