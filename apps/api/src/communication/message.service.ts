import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationService } from './conversation.service';
import { SimulationEngineService } from '../simulation/simulation-engine.service';
import { RelationshipService } from './relationship.service';

export enum MessageSenderType {
  EMPLOYEE = 'EMPLOYEE',
  SYSTEM = 'SYSTEM',
  CHAIRMAN = 'CHAIRMAN',
}

export enum MessageType {
  TEXT = 'TEXT',
  SYSTEM_EVENT = 'SYSTEM_EVENT',
  DECISION = 'DECISION',
  ACTION_REQUEST = 'ACTION_REQUEST',
  MEETING_UPDATE = 'MEETING_UPDATE',
  TASK_UPDATE = 'TASK_UPDATE',
  PROJECT_UPDATE = 'PROJECT_UPDATE',
}

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationService: ConversationService,
    private readonly relationshipService: RelationshipService,
    @Inject(forwardRef(() => SimulationEngineService)) private readonly simulationEngine: SimulationEngineService,
  ) {}

  async sendMessage(
    companyId: string,
    conversationId: string,
    senderId: string | null,
    senderType: MessageSenderType,
    content: string,
    messageType: MessageType = MessageType.TEXT,
    metadata?: any,
    parentMessageId?: string
  ) {
    // Validate conversation
    const conv = await this.conversationService.getConversation(companyId, conversationId, senderType === 'EMPLOYEE' ? senderId : undefined);

    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        senderEmployeeId: senderType === 'EMPLOYEE' ? senderId : null,
        senderType,
        content,
        messageType,
        parentMessageId,
        metadata: metadata || {},
      }
    });

    // Update conversation timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    // Fire simulation event if it's an employee or chairman sending to employees
    if (senderType === 'EMPLOYEE' || senderType === 'CHAIRMAN') {
      const recipientIds = conv.participants
        .map(p => p.employeeId)
        .filter(id => id !== senderId);

      for (const targetId of recipientIds) {
        if (senderType === 'EMPLOYEE' && senderId) {
          // Track relationship metric asynchronously (no await needed for metric increment)
          this.relationshipService.trackMessageExchange(companyId, senderId, targetId).catch((e) => this.logger.error(e?.message ?? e));
        }

        this.simulationEngine.dispatchCustomEvent(companyId, targetId, {
          type: 'NEW_MESSAGE_RECEIVED',
          messageId: msg.id,
          conversationId: conv.id,
          senderId: senderId,
          content: content,
        });
      }
    }

    return msg;
  }

  async getMessages(companyId: string, conversationId: string, viewerId?: string, limit = 50, skip = 0) {
    await this.conversationService.getConversation(companyId, conversationId, viewerId);

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
      include: {
        parentMessage: true,
      }
    });
  }
}
