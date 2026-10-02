import {
  Injectable, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdPortfolioService } from './rd-portfolio.service';
import { RdCapabilityService } from './rd-capability.service';
import { RdInitiativeService } from './rd-initiative.service';

@Injectable()
export class RdCapabilityLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: RdPortfolioService,
    private readonly capabilities: RdCapabilityService,
    private readonly initiatives: RdInitiativeService,
  ) {}

  async link(companyId: string, actorId: string, initiativeId: string, capabilityId: string) {
    await this.portfolios.verifyActor(actorId, companyId);
    await this.initiatives.get(companyId, initiativeId);
    await this.capabilities.get(companyId, capabilityId);
    try {
      return await this.prisma.rdCapabilityLink.create({
        data: { companyId, initiativeId, capabilityId, createdBy: actorId },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Capability already linked to initiative');
      throw e;
    }
  }

  async list(companyId: string, initiativeId: string) {
    await this.initiatives.get(companyId, initiativeId);
    return this.prisma.rdCapabilityLink.findMany({
      where: { companyId, initiativeId },
      include: { capability: true },
    });
  }
}
