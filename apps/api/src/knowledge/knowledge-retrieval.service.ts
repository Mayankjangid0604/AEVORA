import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeStatus, KnowledgeImportance, KnowledgeType } from '@prisma/client';

@Injectable()
export class KnowledgeRetrievalService {
  constructor(private readonly prisma: PrismaService) {}

  async searchKnowledge(
    companyId: string,
    query: {
      keyword?: string;
      type?: KnowledgeType;
      status?: KnowledgeStatus;
      importance?: KnowledgeImportance;
      projectId?: string;
      departmentId?: string;
      canonicalOnly?: boolean;
    }
  ) {
    const where: any = { companyId };

    if (query.type) where.type = query.type;
    if (query.importance) where.importance = query.importance;
    if (query.projectId) where.projectId = query.projectId;
    if (query.departmentId) where.departmentId = query.departmentId;

    if (query.canonicalOnly) {
      where.status = KnowledgeStatus.CANONICAL;
    } else if (query.status) {
      where.status = query.status;
    } else {
      // By default don't show archived, superseded or rejected unless requested
      where.status = {
        in: [KnowledgeStatus.CANONICAL, KnowledgeStatus.VALIDATED, KnowledgeStatus.CANDIDATE]
      };
    }

    if (query.keyword) {
      // Basic deterministic keyword search
      where.OR = [
        { title: { contains: query.keyword, mode: 'insensitive' } },
        { content: { contains: query.keyword, mode: 'insensitive' } },
        { summary: { contains: query.keyword, mode: 'insensitive' } }
      ];
    }

    // Retrieve matches
    const results = await this.prisma.knowledgeRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sources: true,
      }
    });

    return results;
  }
}
