import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';


@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  async createDirectConversation(companyId: string, employeeIdA: string, employeeIdB: string) {
    if (employeeIdA === employeeIdB) throw new BadRequestException('Cannot create a direct conversation with yourself');
    
    // Validate employees belong to the same company
    const [empA, empB] = await Promise.all([
      this.prisma.employee.findUnique({ where: { id: employeeIdA } }),
      this.prisma.employee.findUnique({ where: { id: employeeIdB } })
    ]);
    
    if (!empA || empA.companyId !== companyId) throw new ForbiddenException('Employee A not in company');
    if (!empB || empB.companyId !== companyId) throw new ForbiddenException('Employee B not in company');

    // Check if direct conversation already exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        companyId,
        type: 'DIRECT',
        participants: {
          every: {
            employeeId: { in: [employeeIdA, employeeIdB] }
          }
        }
      },
      include: { participants: true }
    });

    if (existing && existing.participants.length === 2) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        companyId,
        type: 'DIRECT',
        createdByEmployeeId: employeeIdA,
        participants: {
          create: [
            { employeeId: employeeIdA },
            { employeeId: employeeIdB }
          ]
        }
      },
      include: { participants: true }
    });
  }

  async createGroupConversation(companyId: string, creatorId: string, employeeIds: string[], title?: string) {
    const allIds = Array.from(new Set([creatorId, ...employeeIds]));
    if (allIds.length < 2) throw new BadRequestException('Group must have at least 2 participants');

    const emps = await this.prisma.employee.findMany({
      where: { id: { in: allIds }, companyId }
    });

    if (emps.length !== allIds.length) {
      throw new ForbiddenException('One or more employees do not belong to the company');
    }

    return this.prisma.conversation.create({
      data: {
        companyId,
        type: 'GROUP',
        title,
        createdByEmployeeId: creatorId,
        participants: {
          create: allIds.map(id => ({ employeeId: id }))
        }
      },
      include: { participants: true }
    });
  }

  async getConversation(companyId: string, conversationId: string, viewerEmployeeId?: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true }
    });

    if (!conv || conv.companyId !== companyId) {
      throw new NotFoundException('Conversation not found in this company');
    }

    if (viewerEmployeeId) {
      const isParticipant = conv.participants.some(p => p.employeeId === viewerEmployeeId);
      // Wait, is it a public department channel?
      if (!isParticipant && !['DEPARTMENT', 'PROJECT'].includes(conv.type)) {
        throw new ForbiddenException('Not a participant of this conversation');
      }
    }

    return conv;
  }

  async getMyConversations(companyId: string, employeeId: string) {
    return this.prisma.conversation.findMany({
      where: {
        companyId,
        participants: {
          some: { employeeId }
        }
      },
      include: {
        participants: { include: { employee: { select: { id: true, name: true, role: true } } } }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async addParticipant(companyId: string, conversationId: string, inviterId: string, targetId: string) {
    const conv = await this.getConversation(companyId, conversationId, inviterId);
    
    if (conv.type === 'DIRECT') throw new BadRequestException('Cannot add participants to a DIRECT conversation');
    
    const target = await this.prisma.employee.findUnique({ where: { id: targetId } });
    if (!target || target.companyId !== companyId) throw new ForbiddenException('Target employee not in company');
    
    return this.prisma.conversationParticipant.create({
      data: {
        conversationId,
        employeeId: targetId
      }
    });
  }
}
