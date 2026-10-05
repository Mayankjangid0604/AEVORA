import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResHypothesisStatus } from '@prisma/client';

const VALID_TRANSITIONS: Record<ResHypothesisStatus, ResHypothesisStatus[]> = {
  PROPOSED:    [ResHypothesisStatus.TESTING, ResHypothesisStatus.ABANDONED],
  TESTING:     [ResHypothesisStatus.SUPPORTED, ResHypothesisStatus.REFUTED, ResHypothesisStatus.INCONCLUSIVE, ResHypothesisStatus.ABANDONED],
  SUPPORTED:   [ResHypothesisStatus.ABANDONED],
  REFUTED:     [ResHypothesisStatus.ABANDONED],
  INCONCLUSIVE:[ResHypothesisStatus.TESTING, ResHypothesisStatus.ABANDONED],
  ABANDONED:   [],
};

@Injectable()
export class ResHypothesisService {
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

  async proposeHypothesis(companyId: string, actorId: string, dto: {
    projectId: string;
    questionId?: string;
    statement: string;
    rationale: string;
    variables?: unknown;
    expectedRelationship: string;
    measurableOutcome: string;
    assumptions?: unknown[];
    confidence?: number;
    falsificationCriteria: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100))
      throw new BadRequestException('confidence must be 0-100');

    const project = await this.prisma.labProject.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    if (dto.questionId) {
      const q = await this.prisma.resQuestion.findUnique({ where: { id: dto.questionId } });
      if (!q || q.companyId !== companyId) throw new NotFoundException('Question not found');
    }

    const h = await this.prisma.resHypothesis.create({
      data: {
        companyId,
        projectId: dto.projectId,
        questionId: dto.questionId,
        statement: dto.statement,
        rationale: dto.rationale,
        variables: (dto.variables ?? {}) as any,
        expectedRelationship: dto.expectedRelationship,
        measurableOutcome: dto.measurableOutcome,
        assumptions: (dto.assumptions ?? []) as any,
        confidence: dto.confidence ?? 50,
        falsificationCriteria: dto.falsificationCriteria,
        status: ResHypothesisStatus.PROPOSED,
        createdBy: actorId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'RES_HYPOTHESIS_PROPOSED', objectType: 'ResHypothesis', objectId: h.id, newValue: { statement: h.statement } });
    return h;
  }

  async advanceStatus(companyId: string, actorId: string, hypothesisId: string, newStatus: ResHypothesisStatus, evidenceNote?: string) {
    await this.verifyActor(actorId, companyId);
    const h = await this.prisma.resHypothesis.findUnique({ where: { id: hypothesisId } });
    if (!h || h.companyId !== companyId) throw new NotFoundException('Hypothesis not found');

    // Self-tester prevention: creator cannot mark their own hypothesis as SUPPORTED or REFUTED
    if ((newStatus === ResHypothesisStatus.SUPPORTED || newStatus === ResHypothesisStatus.REFUTED) && h.createdBy === actorId)
      throw new ForbiddenException('Hypothesis creator cannot self-validate as SUPPORTED or REFUTED');

    const allowed = VALID_TRANSITIONS[h.status];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition from ${h.status} to ${newStatus}`);

    const updated = await this.prisma.resHypothesis.update({
      where: { id: hypothesisId },
      data: { status: newStatus, testedById: actorId },
    });
    await this.audit.record({ companyId, actorId, action: 'RES_HYPOTHESIS_STATUS_CHANGED', objectType: 'ResHypothesis', objectId: hypothesisId, oldValue: { status: h.status }, newValue: { status: newStatus, evidenceNote } });
    return updated;
  }

  async getHypotheses(companyId: string, projectId?: string, status?: ResHypothesisStatus) {
    return this.prisma.resHypothesis.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
