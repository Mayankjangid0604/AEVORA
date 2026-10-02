import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResEvidenceType } from '@prisma/client';

@Injectable()
export class LabEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async addEvidence(companyId: string, actorId: string, dto: {
    hypothesisId?: string;
    evidenceType: ResEvidenceType;
    content: string;
    source?: string;
    sourceType?: string;
    provenance?: string;
    credibility?: number;
    confidence?: number;
    isContradicting?: boolean;
    processingMethod?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.hypothesisId) {
      const h = await this.prisma.resHypothesis.findUnique({ where: { id: dto.hypothesisId } });
      if (!h || h.companyId !== companyId) throw new NotFoundException('Hypothesis not found');
    }

    const ev = await this.prisma.labEvidenceItem.create({
      data: {
        companyId,
        hypothesisId: dto.hypothesisId,
        evidenceType: dto.evidenceType,
        content: dto.content,
        source: dto.source,
        sourceType: dto.sourceType,
        retrievedAt: dto.source ? new Date() : undefined,
        provenance: dto.provenance,
        credibility: dto.credibility ?? 50,
        confidence: dto.confidence ?? 50,
        isContradicting: dto.isContradicting ?? false,
        recordedBy: actorId,
        processingMethod: dto.processingMethod,
        isAdvisory: true, // evidence is ALWAYS advisory — never auto-becomes authoritative fact
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_EVIDENCE_ADDED', objectType: 'LabEvidenceItem', objectId: ev.id, newValue: { evidenceType: ev.evidenceType, isContradicting: ev.isContradicting } });
    return ev;
  }

  async getEvidence(companyId: string, hypothesisId?: string) {
    return this.prisma.labEvidenceItem.findMany({
      where: { companyId, ...(hypothesisId ? { hypothesisId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
