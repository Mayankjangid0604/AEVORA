import {
  Injectable, ForbiddenException, NotFoundException,
  ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BuAuditService } from './bu-audit.service';
import { BuStatus, BuLifecycle, EmployeeStatus } from '@prisma/client';

const LIFECYCLE_TRANSITIONS: Record<BuLifecycle, BuLifecycle[]> = {
  CHARTER:     [BuLifecycle.STRATEGY],
  STRATEGY:    [BuLifecycle.OBJECTIVES],
  OBJECTIVES:  [BuLifecycle.WORKFORCE],
  WORKFORCE:   [BuLifecycle.OPERATIONS],
  OPERATIONS:  [BuLifecycle.PERFORMANCE],
  PERFORMANCE: [BuLifecycle.REVIEW],
  REVIEW:      [BuLifecycle.RETIRED],
  RETIRED:     [],
};

@Injectable()
export class BuBusinessUnitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: BuAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    name: string; code: string; description?: string; charter?: string;
    leaderId?: string; parentBuId?: string; strategicThemeId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.businessUnit.findUnique({ where: { companyId_code: { companyId, code: dto.code } } });
    if (existing) throw new ConflictException('BU code already exists in company');
    const bu = await this.prisma.businessUnit.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        description: dto.description,
        charter: dto.charter,
        leaderId: dto.leaderId,
        parentBuId: dto.parentBuId,
        strategicThemeId: dto.strategicThemeId,
        registeredBy: actorId,
        status: BuStatus.DRAFT,
        lifecycle: BuLifecycle.CHARTER,
        isAdvisory: false,
      },
    });
    await this.audit.record({ companyId, actorId, buId: bu.id, action: 'BU_CREATED', objectType: 'BusinessUnit', objectId: bu.id, newValue: { name: bu.name, code: bu.code } });
    return bu;
  }

  async list(companyId: string, status?: BuStatus) {
    return this.prisma.businessUnit.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, buId: string) {
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId }, include: { objectives: true, kpis: true, budgets: true, risks: true } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('Business unit not found');
    return bu;
  }

  async update(companyId: string, actorId: string, buId: string, dto: {
    name?: string; description?: string; charter?: string; leaderId?: string;
    parentBuId?: string; strategicThemeId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('Business unit not found');
    if (bu.lifecycle === BuLifecycle.RETIRED) throw new BadRequestException('Cannot mutate a retired BU');
    const old = { name: bu.name, description: bu.description };
    // Explicitly whitelist updatable fields — lifecycle/status/isAdvisory cannot be mass-assigned
    const safeData = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.charter !== undefined ? { charter: dto.charter } : {}),
      ...(dto.leaderId !== undefined ? { leaderId: dto.leaderId } : {}),
      ...(dto.parentBuId !== undefined ? { parentBuId: dto.parentBuId } : {}),
      ...(dto.strategicThemeId !== undefined ? { strategicThemeId: dto.strategicThemeId } : {}),
    };
    const updated = await this.prisma.businessUnit.update({ where: { id: buId }, data: safeData });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_UPDATED', objectType: 'BusinessUnit', objectId: buId, oldValue: old, newValue: dto });
    return updated;
  }

  async advanceLifecycle(companyId: string, actorId: string, buId: string, newLifecycle: BuLifecycle) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('Business unit not found');
    const allowed = LIFECYCLE_TRANSITIONS[bu.lifecycle];
    if (!allowed.includes(newLifecycle)) throw new BadRequestException(`Cannot transition from ${bu.lifecycle} to ${newLifecycle}`);
    // Self-approval prevention for OPERATIONS transition
    if (newLifecycle === BuLifecycle.OPERATIONS && bu.registeredBy === actorId) {
      throw new ForbiddenException('Self-approval blocked: OPERATIONS transition requires a different approver than the registrant');
    }
    const updated = await this.prisma.businessUnit.update({
      where: { id: buId },
      data: { lifecycle: newLifecycle, status: newLifecycle === BuLifecycle.RETIRED ? BuStatus.RETIRED : BuStatus.ACTIVE },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_LIFECYCLE_ADVANCED', objectType: 'BusinessUnit', objectId: buId, oldValue: { lifecycle: bu.lifecycle }, newValue: { lifecycle: newLifecycle } });
    return updated;
  }

  async approve(companyId: string, actorId: string, buId: string) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('Business unit not found');
    if (bu.registeredBy === actorId) throw new ForbiddenException('Self-approval blocked');
    const updated = await this.prisma.businessUnit.update({
      where: { id: buId },
      data: {
        approvedBy: actorId,
        approvedAt: new Date(),
        status: BuStatus.ACTIVE,
        ...(bu.lifecycle === BuLifecycle.OBJECTIVES ? { lifecycle: BuLifecycle.OPERATIONS } : {}),
      },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_APPROVED', objectType: 'BusinessUnit', objectId: buId, newValue: { approvedBy: actorId } });
    return updated;
  }

  async retire(companyId: string, actorId: string, buId: string, reason?: string) {
    await this.verifyActor(actorId, companyId);
    const bu = await this.prisma.businessUnit.findUnique({ where: { id: buId } });
    if (!bu || bu.companyId !== companyId) throw new NotFoundException('Business unit not found');
    const updated = await this.prisma.businessUnit.update({
      where: { id: buId },
      data: { status: BuStatus.RETIRED, lifecycle: BuLifecycle.RETIRED, retiredAt: new Date(), retiredBy: actorId },
    });
    await this.audit.record({ companyId, actorId, buId, action: 'BU_RETIRED', objectType: 'BusinessUnit', objectId: buId, newValue: { reason } });
    return updated;
  }
}
