import {
  Injectable, ForbiddenException, NotFoundException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdAuditService } from './rd-audit.service';
import { EmployeeStatus, RdPortfolioStatus } from '@prisma/client';

@Injectable()
export class RdPortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RdAuditService,
  ) {}

  async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    name: string; description?: string; ownerId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    try {
      const portfolio = await this.prisma.rdPortfolio.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          ownerId: dto.ownerId,
          isAdvisory: false,
          createdBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, action: 'RD_PORTFOLIO_CREATED', portfolioId: portfolio.id, objectType: 'RdPortfolio', objectId: portfolio.id, newValue: { name: portfolio.name } });
      return portfolio;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Portfolio name already exists');
      throw e;
    }
  }

  async list(companyId: string, status?: RdPortfolioStatus) {
    return this.prisma.rdPortfolio.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, portfolioId: string) {
    const p = await this.prisma.rdPortfolio.findUnique({ where: { id: portfolioId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Portfolio not found');
    return p;
  }

  async update(companyId: string, actorId: string, portfolioId: string, dto: {
    name?: string; description?: string; ownerId?: string; status?: RdPortfolioStatus;
  }) {
    await this.verifyActor(actorId, companyId);
    const portfolio = await this.get(companyId, portfolioId);
    if (portfolio.status === RdPortfolioStatus.CLOSED) {
      throw new BadRequestException('Cannot update a CLOSED portfolio');
    }
    const { name, description, ownerId, status } = dto;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (ownerId !== undefined) data.ownerId = ownerId;
    if (status !== undefined) data.status = status;
    try {
      const updated = await this.prisma.rdPortfolio.update({ where: { id: portfolioId }, data });
      await this.audit.record({ companyId, actorId, action: 'RD_PORTFOLIO_UPDATED', portfolioId, objectType: 'RdPortfolio', objectId: portfolioId, newValue: data });
      return updated;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Portfolio name already exists');
      throw e;
    }
  }
}
