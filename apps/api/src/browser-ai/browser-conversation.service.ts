import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BrowserConversationService {
  private readonly logger = new Logger(BrowserConversationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    employeeId: string,
    profileId: string,
    provider: string,
    title: string
  ) {
    return this.prisma.browserConversation.create({
      data: {
        employeeId,
        browserProfileId: profileId,
        provider,
        conversationTitle: title,
      },
    });
  }

  async findConversation(employeeId: string, provider: string) {
    return this.prisma.browserConversation.findUnique({
      where: {
        employeeId_provider: { employeeId, provider }
      }
    });
  }
}
