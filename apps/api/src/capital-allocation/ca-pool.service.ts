import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class CaPoolService {
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

  async create(companyId: string, actorId: string, dto: {
    name: string; description?: string; totalMc: number; availableMc: number;
    fiscalYear: number; currency?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.totalMc)) throw new BadRequestException('totalMc must be an integer');
    if (!Number.isInteger(dto.availableMc)) throw new BadRequestException('availableMc must be an integer');
    try {
      const pool = await this.prisma.caCapitalPool.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          totalMc: dto.totalMc,
          availableMc: dto.availableMc,
          fiscalYear: dto.fiscalYear,
          currency: dto.currency ?? 'USD',
          createdBy: actorId,
          isAdvisory: true,
        },
      });
      await this.audit.record({ companyId, actorId, poolId: pool.id, action: 'CA_POOL_CREATED', objectType: 'CaCapitalPool', objectId: pool.id, newValue: { name: pool.name } });
      return pool;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Pool with this name/fiscalYear already exists');
      throw e;
    }
  }

  async list(companyId: string, fiscalYear?: number) {
    return this.prisma.caCapitalPool.findMany({
      where: { companyId, ...(fiscalYear ? { fiscalYear } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, poolId: string) {
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    return pool;
  }

  async update(companyId: string, actorId: string, poolId: string, dto: {
    name?: string; description?: string; totalMc?: number; availableMc?: number; notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const pool = await this.prisma.caCapitalPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException('Capital pool not found');
    if (dto.totalMc !== undefined && !Number.isInteger(dto.totalMc)) throw new BadRequestException('totalMc must be an integer');
    if (dto.availableMc !== undefined && !Number.isInteger(dto.availableMc)) throw new BadRequestException('availableMc must be an integer');
    // explicit whitelist — no isAdvisory, companyId, createdBy, approvedBy
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.totalMc !== undefined) data.totalMc = dto.totalMc;
    if (dto.availableMc !== undefined) data.availableMc = dto.availableMc;
    return this.prisma.caCapitalPool.update({ where: { id: poolId }, data });
  }
}
