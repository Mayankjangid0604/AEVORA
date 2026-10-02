import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeSourceType } from '@prisma/client';
import { KnowledgeService } from './knowledge.service';

@Injectable()
export class KnowledgeProvenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async addProvenance(
    companyId: string,
    knowledgeId: string,
    sourceData: {
      sourceType: KnowledgeSourceType;
      sourceId: string;
      sourceReference?: string;
      excerptOrSummary?: string;
    }
  ) {
    // Assert knowledge exists and belongs to company
    await this.knowledgeService.getKnowledgeById(companyId, knowledgeId);

    return this.prisma.knowledgeSource.create({
      data: {
        knowledgeId,
        sourceType: sourceData.sourceType,
        sourceId: sourceData.sourceId,
        sourceReference: sourceData.sourceReference,
        excerptOrSummary: sourceData.excerptOrSummary,
      }
    });
  }

  async getProvenanceForKnowledge(companyId: string, knowledgeId: string) {
    const record = await this.knowledgeService.getKnowledgeById(companyId, knowledgeId);
    return {
      sources: record.sources || [],
      validations: (record as any).validations || []
    };
  }
}
