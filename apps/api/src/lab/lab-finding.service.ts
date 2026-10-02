import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResFindingStatus } from '@prisma/client';

const FINDING_TRANSITIONS: Record<ResFindingStatus, ResFindingStatus[]> = {
  DRAFT:        [ResFindingStatus.UNDER_REVIEW, ResFindingStatus.ARCHIVED],
  UNDER_REVIEW: [ResFindingStatus.VALIDATED, ResFindingStatus.REJECTED, ResFindingStatus.INCONCLUSIVE],
  VALIDATED:    [ResFindingStatus.ARCHIVED],
  REJECTED:     [ResFindingStatus.ARCHIVED],
  INCONCLUSIVE: [ResFindingStatus.UNDER_REVIEW, ResFindingStatus.ARCHIVED],
  ARCHIVED:     [],
};

@Injectable()
export class LabFindingService {
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

  async createFinding(companyId: string, actorId: string, dto: {
    projectId: string;
    hypothesisId?: string;
    statement: string;
    supportingEvidence?: unknown[];
    confidence?: number;
    limitations?: unknown[];
    counterEvidence?: unknown[];
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100))
      throw new BadRequestException('confidence must be 0-100');

    const project = await this.prisma.labProject.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    const finding = await this.prisma.labFinding.create({
      data: {
        companyId,
        projectId: dto.projectId,
        hypothesisId: dto.hypothesisId,
        statement: dto.statement,
        supportingEvidence: (dto.supportingEvidence ?? []) as any,
        confidence: dto.confidence ?? 50,
        limitations: (dto.limitations ?? []) as any,
        counterEvidence: (dto.counterEvidence ?? []) as any,
        authorId: actorId,
        status: ResFindingStatus.DRAFT,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_FINDING_CREATED', objectType: 'LabFinding', objectId: finding.id, newValue: { statement: finding.statement } });
    return finding;
  }

  async advanceFindingStatus(companyId: string, actorId: string, findingId: string, newStatus: ResFindingStatus) {
    await this.verifyActor(actorId, companyId);
    const finding = await this.prisma.labFinding.findUnique({ where: { id: findingId } });
    if (!finding || finding.companyId !== companyId) throw new NotFoundException('Finding not found');

    // Self-validation prevention: author cannot validate/reject own finding
    if ((newStatus === ResFindingStatus.VALIDATED || newStatus === ResFindingStatus.REJECTED) && finding.authorId === actorId)
      throw new ForbiddenException('Finding author cannot self-validate or self-reject their own finding');

    const allowed = FINDING_TRANSITIONS[finding.status];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition from ${finding.status} to ${newStatus}`);

    const updated = await this.prisma.labFinding.update({
      where: { id: findingId },
      data: {
        status: newStatus,
        evaluatorId: actorId,
        reviewedAt: new Date(),
      },
    });
    await this.audit.record({ companyId, actorId, action: 'LAB_FINDING_STATUS_CHANGED', objectType: 'LabFinding', objectId: findingId, oldValue: { status: finding.status }, newValue: { status: newStatus } });
    return updated;
  }

  async getFindings(companyId: string, projectId?: string, status?: ResFindingStatus) {
    return this.prisma.labFinding.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
