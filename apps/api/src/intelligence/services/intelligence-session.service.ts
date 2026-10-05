import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(companyId: string, employeeId: string, objective: string, context?: { taskId?: string, projectId?: string, goalId?: string }) {
    return this.prisma.intelligenceSession.create({
      data: {
        companyId,
        employeeId,
        objective,
        taskId: context?.taskId,
        projectId: context?.projectId,
        status: 'ACTIVE',
      },
    });
  }

  async completeSession(sessionId: string) {
    return this.prisma.intelligenceSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED' },
    });
  }

  async failSession(sessionId: string) {
    return this.prisma.intelligenceSession.update({
      where: { id: sessionId },
      data: { status: 'FAILED' },
    });
  }
}
