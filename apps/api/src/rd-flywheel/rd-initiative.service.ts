import {
  Injectable, ForbiddenException, NotFoundException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdAuditService } from './rd-audit.service';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdInitiativeStatus } from '@prisma/client';

function assertInteger(val: any, field: string) {
  if (val !== undefined && val !== null) {
    if (!Number.isInteger(val)) throw new BadRequestException(`${field} must be an integer`);
  }
}

@Injectable()
export class RdInitiativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RdAuditService,
    private readonly portfolios: RdPortfolioService,
  ) {}

  private async killSwitch(feature: string) {
    const ks = await this.prisma.killSwitchConfig.findFirst({ where: { companyId: null, feature, isDisabled: true } });
    return !!ks;
  }

  async create(companyId: string, actorId: string, portfolioId: string, dto: {
    title: string; description?: string; priority?: number;
    researchRef?: string; modelRef?: string; productRef?: string;
    estimatedCostMc?: number; idempotencyKey: string;
  }) {
    await this.portfolios.verifyActor(actorId, companyId);
    await this.portfolios.get(companyId, portfolioId);
    assertInteger(dto.estimatedCostMc, 'estimatedCostMc');

    // Idempotency: check existing
    const existing = await this.prisma.rdInitiative.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
      return existing;
    }

    try {
      const initiative = await this.prisma.rdInitiative.create({
        data: {
          companyId,
          portfolioId,
          title: dto.title,
          description: dto.description,
          priority: dto.priority ?? 50,
          researchRef: dto.researchRef,
          modelRef: dto.modelRef,
          productRef: dto.productRef,
          estimatedCostMc: dto.estimatedCostMc,
          isAdvisory: true,
          proposedBy: actorId,
          status: RdInitiativeStatus.PROPOSED,
          idempotencyKey: dto.idempotencyKey,
        },
      });
      await this.audit.record({ companyId, actorId, action: 'RD_INITIATIVE_CREATED', portfolioId, objectType: 'RdInitiative', objectId: initiative.id });
      return initiative;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing2 = await this.prisma.rdInitiative.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (existing2) return existing2;
        throw new ConflictException('Initiative already exists');
      }
      throw e;
    }
  }

  private async getInitiative(companyId: string, initiativeId: string) {
    const i = await this.prisma.rdInitiative.findUnique({ where: { id: initiativeId } });
    if (!i || i.companyId !== companyId) throw new NotFoundException('Initiative not found');
    return i;
  }

  async approve(companyId: string, actorId: string, initiativeId: string) {
    await this.portfolios.verifyActor(actorId, companyId);
    if (await this.killSwitch('RD_INITIATIVE_APPROVAL')) throw new ForbiddenException('Kill switch RD_INITIATIVE_APPROVAL active');
    const initiative = await this.getInitiative(companyId, initiativeId);
    if (initiative.status !== RdInitiativeStatus.PROPOSED) throw new BadRequestException('Initiative must be PROPOSED to approve');
    if (initiative.proposedBy === actorId) throw new ForbiddenException('Cannot self-approve initiative');
    const updated = await this.prisma.rdInitiative.update({
      where: { id: initiativeId },
      data: { status: RdInitiativeStatus.APPROVED, approvedBy: actorId, approvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'RD_INITIATIVE_APPROVED', portfolioId: initiative.portfolioId, objectType: 'RdInitiative', objectId: initiativeId });
    return updated;
  }

  async start(companyId: string, actorId: string, initiativeId: string) {
    await this.portfolios.verifyActor(actorId, companyId);
    const initiative = await this.getInitiative(companyId, initiativeId);
    if (initiative.status !== RdInitiativeStatus.APPROVED) throw new BadRequestException('Initiative must be APPROVED to start');
    const updated = await this.prisma.rdInitiative.update({ where: { id: initiativeId }, data: { status: RdInitiativeStatus.IN_PROGRESS } });
    await this.audit.record({ companyId, actorId, action: 'RD_INITIATIVE_STARTED', portfolioId: initiative.portfolioId, objectType: 'RdInitiative', objectId: initiativeId });
    return updated;
  }

  async complete(companyId: string, actorId: string, initiativeId: string) {
    await this.portfolios.verifyActor(actorId, companyId);
    const initiative = await this.getInitiative(companyId, initiativeId);
    if (initiative.status !== RdInitiativeStatus.IN_PROGRESS) throw new BadRequestException('Initiative must be IN_PROGRESS to complete');
    const updated = await this.prisma.rdInitiative.update({ where: { id: initiativeId }, data: { status: RdInitiativeStatus.COMPLETED, completedAt: new Date() } });
    await this.audit.record({ companyId, actorId, action: 'RD_INITIATIVE_COMPLETED', portfolioId: initiative.portfolioId, objectType: 'RdInitiative', objectId: initiativeId });
    return updated;
  }

  async cancel(companyId: string, actorId: string, initiativeId: string) {
    await this.portfolios.verifyActor(actorId, companyId);
    const initiative = await this.getInitiative(companyId, initiativeId);
    const cancellable: RdInitiativeStatus[] = [RdInitiativeStatus.PROPOSED, RdInitiativeStatus.APPROVED, RdInitiativeStatus.IN_PROGRESS];
    if (!cancellable.includes(initiative.status)) throw new BadRequestException('Initiative cannot be cancelled in current state');
    const updated = await this.prisma.rdInitiative.update({ where: { id: initiativeId }, data: { status: RdInitiativeStatus.CANCELLED } });
    await this.audit.record({ companyId, actorId, action: 'RD_INITIATIVE_CANCELLED', portfolioId: initiative.portfolioId, objectType: 'RdInitiative', objectId: initiativeId });
    return updated;
  }

  async list(companyId: string, portfolioId?: string, status?: RdInitiativeStatus) {
    return this.prisma.rdInitiative.findMany({
      where: { companyId, ...(portfolioId ? { portfolioId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, initiativeId: string) {
    return this.getInitiative(companyId, initiativeId);
  }

  async update(companyId: string, actorId: string, initiativeId: string, dto: {
    title?: string; description?: string; priority?: number;
    researchRef?: string; modelRef?: string; productRef?: string;
    estimatedCostMc?: number;
  }) {
    await this.portfolios.verifyActor(actorId, companyId);
    await this.getInitiative(companyId, initiativeId);
    assertInteger(dto.estimatedCostMc, 'estimatedCostMc');
    const { title, description, priority, researchRef, modelRef, productRef, estimatedCostMc } = dto;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (priority !== undefined) data.priority = priority;
    if (researchRef !== undefined) data.researchRef = researchRef;
    if (modelRef !== undefined) data.modelRef = modelRef;
    if (productRef !== undefined) data.productRef = productRef;
    if (estimatedCostMc !== undefined) data.estimatedCostMc = estimatedCostMc;
    return this.prisma.rdInitiative.update({ where: { id: initiativeId }, data });
  }
}
