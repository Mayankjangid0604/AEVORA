import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdCapabilityMaturity } from '@prisma/client';

@Injectable()
export class RdCapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: RdPortfolioService,
  ) {}

  async create(companyId: string, actorId: string, dto: {
    name: string; description?: string; domain?: string; maturity?: RdCapabilityMaturity;
  }) {
    await this.portfolios.verifyActor(actorId, companyId);
    try {
      return await this.prisma.rdCapability.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          domain: dto.domain,
          maturity: dto.maturity ?? RdCapabilityMaturity.NONE,
          isAdvisory: true,
          assessedBy: actorId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Capability name already exists');
      throw e;
    }
  }

  async list(companyId: string, domain?: string) {
    return this.prisma.rdCapability.findMany({
      where: { companyId, ...(domain ? { domain } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, capabilityId: string) {
    const c = await this.prisma.rdCapability.findUnique({ where: { id: capabilityId } });
    if (!c || c.companyId !== companyId) throw new NotFoundException('Capability not found');
    return c;
  }

  async updateMaturity(companyId: string, actorId: string, capabilityId: string, maturity: RdCapabilityMaturity) {
    await this.portfolios.verifyActor(actorId, companyId);
    await this.get(companyId, capabilityId);
    return this.prisma.rdCapability.update({ where: { id: capabilityId }, data: { maturity } });
  }
}
