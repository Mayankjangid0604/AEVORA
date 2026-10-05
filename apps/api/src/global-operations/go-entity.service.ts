import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus, GoEntityType, GoOperationalStatus } from '@prisma/client';

@Injectable()
export class GoEntityService {
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
    name: string; code: string; regionId: string; countryId?: string;
    entityType?: GoEntityType; currency?: string; timeZone?: string;
    address?: string; registrationNumber?: string; managerId?: string; parentEntityId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: dto.regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    if (dto.countryId) {
      const country = await this.prisma.goCountry.findUnique({ where: { id: dto.countryId } });
      if (!country || country.companyId !== companyId) throw new ForbiddenException('Country not in company');
    }
    try {
      const entity = await this.prisma.goOperatingEntity.create({
        data: {
          companyId, regionId: dto.regionId, countryId: dto.countryId,
          name: dto.name, code: dto.code,
          entityType: dto.entityType ?? GoEntityType.BRANCH,
          status: GoOperationalStatus.PLANNING,
          currency: dto.currency ?? 'USD',
          timeZone: dto.timeZone, address: dto.address,
          registrationNumber: dto.registrationNumber,
          managerId: dto.managerId, parentEntityId: dto.parentEntityId,
          isAdvisory: false,
          registeredBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, regionId: dto.regionId, entityId: entity.id, action: 'GO_ENTITY_CREATED', objectType: 'GoOperatingEntity', objectId: entity.id, newValue: { name: entity.name } });
      return entity;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Entity with this code already exists');
      throw e;
    }
  }

  async list(companyId: string, regionId?: string, status?: GoOperationalStatus) {
    return this.prisma.goOperatingEntity.findMany({
      where: { companyId, ...(regionId ? { regionId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, entityId: string) {
    const entity = await this.prisma.goOperatingEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) throw new NotFoundException('Entity not found');
    return entity;
  }

  async update(companyId: string, actorId: string, entityId: string, dto: {
    name?: string; entityType?: GoEntityType; status?: GoOperationalStatus;
    currency?: string; timeZone?: string; address?: string;
    registrationNumber?: string; managerId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const entity = await this.prisma.goOperatingEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) throw new NotFoundException('Entity not found');
    if (entity.status === GoOperationalStatus.CLOSED) throw new BadRequestException('Cannot update a CLOSED entity');
    // explicit whitelist — no registeredBy, approvedBy, isAdvisory, companyId
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.entityType !== undefined) data.entityType = dto.entityType;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.timeZone !== undefined) data.timeZone = dto.timeZone;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.registrationNumber !== undefined) data.registrationNumber = dto.registrationNumber;
    if (dto.managerId !== undefined) data.managerId = dto.managerId;
    const updated = await this.prisma.goOperatingEntity.update({ where: { id: entityId }, data });
    await this.audit.record({ companyId, actorId, regionId: entity.regionId, entityId, action: 'GO_ENTITY_UPDATED', objectType: 'GoOperatingEntity', objectId: entityId });
    return updated;
  }

  async approve(companyId: string, actorId: string, entityId: string) {
    // kill switch — fail-closed
    if (process.env.GO_ENTITY_APPROVAL !== 'enabled') {
      throw new ForbiddenException('GO_ENTITY_APPROVAL kill switch is not enabled');
    }
    await this.verifyActor(actorId, companyId);
    const entity = await this.prisma.goOperatingEntity.findUnique({ where: { id: entityId } });
    if (!entity || entity.companyId !== companyId) throw new NotFoundException('Entity not found');
    // self-approval blocked
    if (entity.registeredBy === actorId) throw new ForbiddenException('Cannot self-approve entity');
    const updated = await this.prisma.goOperatingEntity.update({
      where: { id: entityId },
      data: { approvedBy: actorId, approvedAt: new Date(), status: GoOperationalStatus.ACTIVE },
    });
    await this.audit.record({ companyId, actorId, regionId: entity.regionId, entityId, action: 'GO_ENTITY_APPROVED', objectType: 'GoOperatingEntity', objectId: entityId, newValue: { approvedBy: actorId } });
    return updated;
  }
}
