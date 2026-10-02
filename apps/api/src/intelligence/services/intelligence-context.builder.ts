import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async buildContext(employeeId: string, companyId: string, params: { taskId?: string; projectId?: string }) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { role: true, skills: true },
    });

    let task = null;
    if (params.taskId) {
      task = await this.prisma.task.findUnique({ where: { id: params.taskId } });
    }

    let project = null;
    if (params.projectId) {
      project = await this.prisma.project.findUnique({ where: { id: params.projectId } });
    }

    // In a real implementation, this would fetch relevant knowledge, memory, and communication
    const relevantKnowledge = [];
    const relevantMemory = [];
    const relevantCommunication = [];

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        role: employee.role.title,
        skills: employee.skills.map(s => ({ name: s.name, level: s.proficiency })),
      },
      task,
      project,
      relevantKnowledge,
      relevantMemory,
      relevantCommunication,
    };
  }
}
