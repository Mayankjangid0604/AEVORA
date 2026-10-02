import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class CaConstraintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CaAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, poolId: string, dto: {
    name: string; description?: string;
    maxSingleAllocMc?: number; minLiquidityMc?: number;
    maxCategoryPct?: number; maxBuPct?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    if (dto.maxSingleAllocMc !== undefined && !Number.isInteger(dto.maxSingleAllocMc)) throw new BadRequestException('maxSingleAllocMc must be an integer');
    if (dto.minLiquidityMc !== undefined && !Number.isInteger(dto.minLiquidityMc)) throw new BadRequestException('minLiquidityMc must be an integer');
    return this.prisma.caConstraint.create({
      data: {
        companyId, poolId,
        name: dto.name, description: dto.description,
        maxSingleAllocMc: dto.maxSingleAllocMc, minLiquidityMc: dto.minLiquidityMc,
        maxCategoryPct: dto.maxCategoryPct, maxBuPct: dto.maxBuPct,
        createdBy: actorId, isAdvisory: true,
      },
    });
  }

  async list(companyId: string, poolId: string) {
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    return this.prisma.caConstraint.findMany({ where: { companyId, poolId }, orderBy: { createdAt: 'asc' } });
  }

  async update(companyId: string, actorId: string, constraintId: string, dto: {
    name?: string; description?: string;
    maxSingleAllocMc?: number; minLiquidityMc?: number;
    maxCategoryPct?: number; maxBuPct?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    const c = await this.prisma.caConstraint.findUnique({ where: { id: constraintId } });
    if (!c || c.companyId !== companyId) throw new NotFoundException('Constraint not found');
    if (dto.maxSingleAllocMc !== undefined && !Number.isInteger(dto.maxSingleAllocMc)) throw new BadRequestException('maxSingleAllocMc must be an integer');
    if (dto.minLiquidityMc !== undefined && !Number.isInteger(dto.minLiquidityMc)) throw new BadRequestException('minLiquidityMc must be an integer');
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.maxSingleAllocMc !== undefined) data.maxSingleAllocMc = dto.maxSingleAllocMc;
    if (dto.minLiquidityMc !== undefined) data.minLiquidityMc = dto.minLiquidityMc;
    if (dto.maxCategoryPct !== undefined) data.maxCategoryPct = dto.maxCategoryPct;
    if (dto.maxBuPct !== undefined) data.maxBuPct = dto.maxBuPct;
    return this.prisma.caConstraint.update({ where: { id: constraintId }, data });
  }
}
