import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { ApprovalValidationService } from '../approval/approval-validation.service';
import { ExecutionEnvironment } from '@prisma/client';

export interface CreateStrategyDto {
  title: string;
  objectives?: string[];
  targetAudiences?: string[];
  positioning?: string;
  messaging?: string;
  channels?: string[];
  campaignPriorities?: string[];
  contentThemes?: string[];
  kpis?: string[];
  budgetRecommendation?: number;
  timing?: string;
  risks?: string[];
  assumptions?: string[];
  generatedByAI?: boolean;
  aiModelId?: string;
}

type StrategyStatus = 'DRAFT' | 'APPROVED' | 'ARCHIVED';
const STATUS_TRANSITIONS: Record<StrategyStatus, StrategyStatus[]> = {
  DRAFT: ['APPROVED', 'ARCHIVED'],
  APPROVED: ['ARCHIVED'],
  ARCHIVED: [],
};

@Injectable()
export class MarketingStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
    private readonly approvalSvc: ApprovalValidationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not an active employee');
    return actor;
  }

  async createStrategy(companyId: string, actorId: string, dto: CreateStrategyDto) {
    await this.verifyActor(actorId, companyId);
    const strategy = await this.prisma.marketingStrategy.create({
      data: {
        companyId,
        title: dto.title,
        objectives: dto.objectives ?? [],
        targetAudiences: dto.targetAudiences ?? [],
        positioning: dto.positioning,
        messaging: dto.messaging,
        channels: dto.channels ?? [],
        campaignPriorities: dto.campaignPriorities ?? [],
        contentThemes: dto.contentThemes ?? [],
        kpis: dto.kpis ?? [],
        budgetRecommendation: dto.budgetRecommendation,
        timing: dto.timing,
        risks: dto.risks ?? [],
        assumptions: dto.assumptions ?? [],
        generatedByAI: dto.generatedByAI ?? false,
        aiModelId: dto.aiModelId,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'STRATEGY_CREATED',
      objectType: 'MarketingStrategy', objectId: strategy.id,
      newValue: { title: dto.title, status: 'DRAFT' },
    });
    return strategy;
  }

  async advanceStrategyStatus(
    companyId: string, actorId: string, strategyId: string,
    newStatus: StrategyStatus, approvalId?: string,
  ) {
    await this.verifyActor(actorId, companyId);
    const strategy = await this.prisma.marketingStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy || strategy.companyId !== companyId) throw new NotFoundException('Strategy not found');

    const current = strategy.status as StrategyStatus;
    const allowed = STATUS_TRANSITIONS[current] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition strategy from ${current} to ${newStatus}`);
    }

    // Approval required to move to APPROVED
    if (newStatus === 'APPROVED') {
      if (!approvalId) throw new BadRequestException('approvalId required to approve strategy');
      await this.approvalSvc.validateAndConsumeApproval(approvalId, {
        companyId, action: 'APPROVE_MARKETING_STRATEGY',
        environment: ExecutionEnvironment.PRODUCTION,
        targetType: 'MarketingStrategy', targetId: strategyId,
        params: { strategyId },
      });
    }

    const updated = await this.prisma.marketingStrategy.update({
      where: { id: strategyId },
      data: { status: newStatus, approvalId: approvalId ?? strategy.approvalId },
    });

    await this.audit.record({
      companyId, actorId, action: 'STRATEGY_STATUS_CHANGED',
      objectType: 'MarketingStrategy', objectId: strategyId,
      oldValue: { status: current }, newValue: { status: newStatus },
    });
    return updated;
  }

  async getStrategy(companyId: string, strategyId: string) {
    const s = await this.prisma.marketingStrategy.findUnique({ where: { id: strategyId } });
    if (!s || s.companyId !== companyId) throw new NotFoundException('Strategy not found');
    return s;
  }

  async getStrategies(companyId: string) {
    return this.prisma.marketingStrategy.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
