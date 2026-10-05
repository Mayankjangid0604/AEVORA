import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdFeedbackType } from '@prisma/client';

@Injectable()
export class RdFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: RdPortfolioService,
  ) {}

  async submit(companyId: string, actorId: string, dto: {
    feedbackType: RdFeedbackType; summary: string;
    detail?: string; sourceRef?: string; initiativeId?: string;
  }) {
    await this.portfolios.verifyActor(actorId, companyId);
    if (dto.initiativeId) {
      const i = await this.prisma.rdInitiative.findUnique({ where: { id: dto.initiativeId } });
      if (!i || i.companyId !== companyId) throw new ForbiddenException('Initiative not in company');
    }
    return this.prisma.rdFeedbackItem.create({
      data: {
        companyId,
        initiativeId: dto.initiativeId,
        feedbackType: dto.feedbackType,
        summary: dto.summary,
        detail: dto.detail,
        sourceRef: dto.sourceRef,
        isAdvisory: true,
        submittedBy: actorId,
      },
    });
  }

  async list(companyId: string, initiativeId?: string, feedbackType?: RdFeedbackType) {
    return this.prisma.rdFeedbackItem.findMany({
      where: {
        companyId,
        ...(initiativeId ? { initiativeId } : {}),
        ...(feedbackType ? { feedbackType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
