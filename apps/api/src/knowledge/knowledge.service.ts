import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeType, KnowledgeStatus, KnowledgeImportance } from '@prisma/client';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async createKnowledge(
    companyId: string,
    data: {
      type: KnowledgeType;
      title: string;
      content: string;
      summary?: string;
      importance?: KnowledgeImportance;
      confidence?: number;
      createdByEmployeeId?: string;
      projectId?: string;
      departmentId?: string;
      metadata?: any;
    },
  ) {
    return this.prisma.knowledgeRecord.create({
      data: {
        companyId,
        type: data.type,
        title: data.title,
        content: data.content,
        summary: data.summary,
        importance: data.importance,
        confidence: data.confidence,
        createdByEmployeeId: data.createdByEmployeeId,
        projectId: data.projectId,
        departmentId: data.departmentId,
        metadata: data.metadata,
        status: KnowledgeStatus.CANDIDATE,
      },
    });
  }

  async getKnowledgeById(companyId: string, knowledgeId: string) {
    const record = await this.prisma.knowledgeRecord.findUnique({
      where: { id: knowledgeId },
      include: {
        sources: true,
        validations: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Knowledge record not found');
    }

    if (record.companyId !== companyId) {
      throw new ForbiddenException('Cannot access knowledge across companies');
    }

    return record;
  }

  async archiveKnowledge(companyId: string, knowledgeId: string) {
    const record = await this.getKnowledgeById(companyId, knowledgeId);
    
    return this.prisma.knowledgeRecord.update({
      where: { id: record.id },
      data: { status: KnowledgeStatus.ARCHIVED },
    });
  }

  async supersedeKnowledge(companyId: string, oldKnowledgeId: string, newKnowledgeId: string) {
    const oldRecord = await this.getKnowledgeById(companyId, oldKnowledgeId);
    const newRecord = await this.getKnowledgeById(companyId, newKnowledgeId);

    // Update old record
    await this.prisma.knowledgeRecord.update({
      where: { id: oldRecord.id },
      data: { status: KnowledgeStatus.SUPERSEDED },
    });

    // Update new record
    return this.prisma.knowledgeRecord.update({
      where: { id: newRecord.id },
      data: { supersedesId: oldRecord.id },
    });
  }
}
