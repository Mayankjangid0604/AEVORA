import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
  constructor(private prisma: PrismaService) {}

  async createMemory(agentId: string, type: 'EPISODIC' | 'SEMANTIC' | 'SHORT_TERM', content: string) {
    return this.prisma.agentMemoryReference.create({
      data: {
        agentId,
        type,
        content
      }
    });
  }

  async getRecentMemories(agentId: string, limit = 5) {
    return this.prisma.agentMemoryReference.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
