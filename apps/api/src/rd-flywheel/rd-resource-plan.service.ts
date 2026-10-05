import {
  Injectable, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdPortfolioService } from './rd-portfolio.service';

function assertInteger(val: any, field: string) {
  if (val !== undefined && val !== null) {
    if (!Number.isInteger(val)) throw new BadRequestException(`${field} must be an integer`);
  }
}

@Injectable()
export class RdResourcePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolios: RdPortfolioService,
  ) {}

  async create(companyId: string, actorId: string, dto: {
    portfolioId?: string; fiscalYear: number; fiscalQuarter?: number;
    allocatedMc: number; forecastedMc?: number; notes?: string;
  }) {
    await this.portfolios.verifyActor(actorId, companyId);
    assertInteger(dto.allocatedMc, 'allocatedMc');
    assertInteger(dto.forecastedMc, 'forecastedMc');

    // Application-level unique check for null fiscalQuarter
    if (dto.fiscalQuarter === undefined || dto.fiscalQuarter === null) {
      const existing = await this.prisma.rdResourcePlan.findFirst({
        where: {
          companyId,
          portfolioId: dto.portfolioId ?? null,
          fiscalYear: dto.fiscalYear,
          fiscalQuarter: null,
        },
      });
      if (existing) throw new ConflictException('Resource plan already exists for this period');
    }

    try {
      return await this.prisma.rdResourcePlan.create({
        data: {
          companyId,
          portfolioId: dto.portfolioId,
          fiscalYear: dto.fiscalYear,
          fiscalQuarter: dto.fiscalQuarter,
          allocatedMc: dto.allocatedMc,
          forecastedMc: dto.forecastedMc,
          notes: dto.notes,
          isAdvisory: true,
          createdBy: actorId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Resource plan already exists for this period');
      throw e;
    }
  }

  async list(companyId: string, portfolioId?: string, fiscalYear?: number) {
    return this.prisma.rdResourcePlan.findMany({
      where: {
        companyId,
        ...(portfolioId ? { portfolioId } : {}),
        ...(fiscalYear ? { fiscalYear } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
