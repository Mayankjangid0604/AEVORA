import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunicationMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async rememberImportantMessage(companyId: string, employeeId: string, messageId: string, context?: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { agent: true }
    });

    if (!employee || employee.companyId !== companyId) {
      throw new NotFoundException('Employee not found or does not belong to the company');
    }

    if (!employee.agent) {
      // Not an agent, skip memory
      return null;
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: true }
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const content = `Important Communication Record [Conversation ${message.conversation.title || message.conversation.id}]: ${message.content} ${context ? `| Context: ${context}` : ''}`;

    return this.prisma.agentMemoryReference.create({
      data: {
        agentId: employee.agent.id,
        type: 'SEMANTIC',
        content: content,
      }
    });
  }
}
