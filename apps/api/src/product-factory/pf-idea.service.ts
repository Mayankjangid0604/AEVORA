import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfIdeaStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfIdeaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PfAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, dto: {
    title: string;
    problemStatement: string;
    proposedSolution?: string;
    targetCustomer?: string;
    marketHypothesis?: string;
    evidence?: string;
    strategicRationale?: string;
    expectedValueMc?: number;
    risks?: string;
    assumptions?: string;
    originatingSource?: string;
    productId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.expectedValueMc !== undefined && !Number.isInteger(dto.expectedValueMc))
      throw new BadRequestException('expectedValueMc must be integer microcents');

    const idea = await this.prisma.pfProductIdea.create({
      data: {
        companyId,
        productId: dto.productId,
        title: dto.title,
        problemStatement: dto.problemStatement,
        proposedSolution: dto.proposedSolution,
        targetCustomer: dto.targetCustomer,
        marketHypothesis: dto.marketHypothesis,
        evidence: dto.evidence,
        strategicRationale: dto.strategicRationale,
        expectedValueMc: dto.expectedValueMc,
        risks: dto.risks,
        assumptions: dto.assumptions,
        originatingSource: dto.originatingSource,
        status: PfIdeaStatus.DRAFT,
        createdBy: actorId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId: dto.productId, action: 'PF_IDEA_CREATED', objectType: 'PfProductIdea', objectId: idea.id, newValue: { title: idea.title } });
    return idea;
  }

  async list(companyId: string, status?: PfIdeaStatus) {
    return this.prisma.pfProductIdea.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, ideaId: string) {
    const idea = await this.prisma.pfProductIdea.findUnique({ where: { id: ideaId } });
    if (!idea || idea.companyId !== companyId) throw new NotFoundException('Idea not found');
    return idea;
  }

  async advanceStatus(companyId: string, actorId: string, ideaId: string, newStatus: PfIdeaStatus) {
    await this.verifyActor(actorId, companyId);
    const idea = await this.prisma.pfProductIdea.findUnique({ where: { id: ideaId } });
    if (!idea || idea.companyId !== companyId) throw new NotFoundException('Idea not found');

    // Prevent AI self-approval: VALIDATED/CONVERTED cannot be set by originator when originatingSource is AI
    if ((newStatus === PfIdeaStatus.VALIDATED || newStatus === PfIdeaStatus.CONVERTED)
      && idea.originatingSource?.toLowerCase().includes('ai')
      && idea.createdBy === actorId)
      throw new ForbiddenException('AI-generated idea cannot be self-validated by the same actor');

    const updated = await this.prisma.pfProductIdea.update({ where: { id: ideaId }, data: { status: newStatus } });
    await this.audit.record({ companyId, actorId, action: 'PF_IDEA_STATUS_CHANGED', objectType: 'PfProductIdea', objectId: ideaId, oldValue: { status: idea.status }, newValue: { status: newStatus } });
    return updated;
  }
}
