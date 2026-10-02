import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OutcomeService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOutcome(sessionId: string, data: { result: string; actualOutcome: string; expectedOutcome: string; success: boolean; lessons?: string }) {
    return this.prisma.intelligenceOutcome.create({
      data: {
        sessionId,
        result: data.result,
        actualOutcome: data.actualOutcome,
        expectedOutcome: data.expectedOutcome,
        success: data.success,
        lessons: data.lessons,
      },
    });
  }
}
