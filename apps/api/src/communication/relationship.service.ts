import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RelationshipService {
  constructor(private readonly prisma: PrismaService) {}

  async trackMessageExchange(companyId: string, senderId: string, recipientId: string) {
    if (senderId === recipientId) return;

    // Ensure predictable ordering for A and B
    const employeeAId = senderId < recipientId ? senderId : recipientId;
    const employeeBId = senderId < recipientId ? recipientId : senderId;

    await this.prisma.employeeRelationship.upsert({
      where: {
        companyId_employeeAId_employeeBId: {
          companyId,
          employeeAId,
          employeeBId,
        }
      },
      update: {
        messagesExchanged: { increment: 1 },
        collaborationCount: { increment: 1 },
      },
      create: {
        companyId,
        employeeAId,
        employeeBId,
        messagesExchanged: 1,
        collaborationCount: 1,
      }
    });
  }

  async trackMeeting(companyId: string, participantIds: string[]) {
    // For every pair, increment meetingsTogether
    for (let i = 0; i < participantIds.length; i++) {
      for (let j = i + 1; j < participantIds.length; j++) {
        const id1 = participantIds[i];
        const id2 = participantIds[j];
        if (id1 === id2) continue;
        
        const employeeAId = id1 < id2 ? id1 : id2;
        const employeeBId = id1 < id2 ? id2 : id1;

        await this.prisma.employeeRelationship.upsert({
          where: {
            companyId_employeeAId_employeeBId: {
              companyId,
              employeeAId,
              employeeBId,
            }
          },
          update: {
            meetingsTogether: { increment: 1 },
            collaborationCount: { increment: 1 },
          },
          create: {
            companyId,
            employeeAId,
            employeeBId,
            meetingsTogether: 1,
            collaborationCount: 1,
          }
        });
      }
    }
  }
}
