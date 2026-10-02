import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus, GoOperationalStatus } from '@prisma/client';

@Injectable()
export class GoRegionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GoAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    name: string; code: string; description?: string; timeZone?: string;
    currency?: string; managerId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    try {
      const region = await this.prisma.goRegion.create({
        data: {
          companyId, name: dto.name, code: dto.code,
          description: dto.description, timeZone: dto.timeZone,
          currency: dto.currency ?? 'USD',
          managerId: dto.managerId,
          isAdvisory: false, // authoritative structural record
          createdBy: actorId,
          status: GoOperationalStatus.ACTIVE,
        },
      });
      await this.audit.record({ companyId, actorId, regionId: region.id, action: 'GO_REGION_CREATED', objectType: 'GoRegion', objectId: region.id, newValue: { name: region.name, code: region.code } });
      return region;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Region with this code already exists');
      throw e;
    }
  }

  async list(companyId: string, status?: GoOperationalStatus) {
    return this.prisma.goRegion.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, regionId: string) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new NotFoundException('Region not found');
    return region;
  }

  async update(companyId: string, actorId: string, regionId: string, dto: {
    name?: string; description?: string; timeZone?: string; currency?: string; managerId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new NotFoundException('Region not found');
    // explicit whitelist — no status, isAdvisory, companyId, createdBy
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.timeZone !== undefined) data.timeZone = dto.timeZone;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.managerId !== undefined) data.managerId = dto.managerId;
    const updated = await this.prisma.goRegion.update({ where: { id: regionId }, data });
    await this.audit.record({ companyId, actorId, regionId, action: 'GO_REGION_UPDATED', objectType: 'GoRegion', objectId: regionId });
    return updated;
  }

  async deactivate(companyId: string, actorId: string, regionId: string) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new NotFoundException('Region not found');
    if (region.status === GoOperationalStatus.CLOSED) throw new BadRequestException('Cannot deactivate a CLOSED region');
    const updated = await this.prisma.goRegion.update({ where: { id: regionId }, data: { status: GoOperationalStatus.SUSPENDED } });
    await this.audit.record({ companyId, actorId, regionId, action: 'GO_REGION_DEACTIVATED', objectType: 'GoRegion', objectId: regionId, oldValue: { status: region.status }, newValue: { status: GoOperationalStatus.SUSPENDED } });
    return updated;
  }
}
