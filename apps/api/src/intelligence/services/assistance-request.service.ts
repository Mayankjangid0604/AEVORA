import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssistanceRequestService {
  constructor(private readonly prisma: PrismaService) {}

  async requestAssistance(companyId: string, requesterEmployeeId: string, data: { question: string; reason: string; urgency?: any; targetEmployeeId?: string; departmentId?: string; taskId?: string; projectId?: string }) {
    return this.prisma.assistanceRequest.create({
      data: {
        companyId,
        requesterId: requesterEmployeeId,
        question: data.question,
        reason: data.reason,
        urgency: data.urgency || 'NORMAL',
        targetEmployeeId: data.targetEmployeeId,
        taskId: data.taskId,
        projectId: data.projectId,
        status: 'OPEN',
      },
    });
  }
}
