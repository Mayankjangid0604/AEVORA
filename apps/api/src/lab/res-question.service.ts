import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus, ResQuestionStatus } from '@prisma/client';

@Injectable()
export class ResQuestionService {
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

  async createQuestion(companyId: string, actorId: string, dto: {
    projectId: string;
    question: string;
    motivation: string;
    domain?: string;
    priority?: number;
    assumptions?: unknown[];
    relatedStrategyId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (dto.priority !== undefined && (dto.priority < 0 || dto.priority > 100))
      throw new BadRequestException('priority must be 0-100');

    const project = await this.prisma.labProject.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) throw new NotFoundException('Project not found');

    const q = await this.prisma.resQuestion.create({
      data: {
        companyId,
        projectId: dto.projectId,
        question: dto.question,
        motivation: dto.motivation,
        domain: dto.domain ?? 'GENERAL',
        ownerId: actorId,
        priority: dto.priority ?? 50,
        assumptions: (dto.assumptions ?? []) as any,
        status: ResQuestionStatus.OPEN,
        relatedStrategyId: dto.relatedStrategyId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'RES_QUESTION_CREATED', objectType: 'ResQuestion', objectId: q.id, newValue: { question: q.question } });
    return q;
  }

  async updateStatus(companyId: string, actorId: string, questionId: string, status: ResQuestionStatus) {
    await this.verifyActor(actorId, companyId);
    const q = await this.prisma.resQuestion.findUnique({ where: { id: questionId } });
    if (!q || q.companyId !== companyId) throw new NotFoundException('Question not found');
    const updated = await this.prisma.resQuestion.update({ where: { id: questionId }, data: { status } });
    await this.audit.record({ companyId, actorId, action: 'RES_QUESTION_STATUS_CHANGED', objectType: 'ResQuestion', objectId: questionId, oldValue: { status: q.status }, newValue: { status } });
    return updated;
  }

  async getQuestions(companyId: string, projectId?: string, status?: ResQuestionStatus) {
    return this.prisma.resQuestion.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
