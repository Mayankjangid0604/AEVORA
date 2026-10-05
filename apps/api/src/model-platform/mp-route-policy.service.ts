import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class MpRoutePolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, dto: {
    name: string;
    description?: string;
    requiredCapability: string;
    maxLatencyMs?: number;
    maxCostPerCallMc?: number;
    minReliabilityScore?: number;
    environment?: string;
    preferredModelId?: string;
    fallbackEnabled?: boolean;
    maxFallbackDepth?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.mpRoutePolicy.findFirst({ where: { companyId, name: dto.name } });
    if (existing) throw new ConflictException('Route policy name already exists');

    if (dto.maxCostPerCallMc !== undefined && !Number.isInteger(dto.maxCostPerCallMc))
      throw new BadRequestException('maxCostPerCallMc must be integer microcents');

    if (dto.preferredModelId) {
      const m = await this.prisma.mpModel.findUnique({ where: { id: dto.preferredModelId } });
      if (!m || m.companyId !== companyId) throw new NotFoundException('Preferred model not found');
    }

    const policy = await this.prisma.mpRoutePolicy.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description,
        requiredCapability: dto.requiredCapability,
        maxLatencyMs: dto.maxLatencyMs,
        maxCostPerCallMc: dto.maxCostPerCallMc,
        minReliabilityScore: dto.minReliabilityScore ?? 0,
        environment: dto.environment ?? 'SANDBOX',
        preferredModelId: dto.preferredModelId,
        fallbackEnabled: dto.fallbackEnabled ?? true,
        maxFallbackDepth: dto.maxFallbackDepth ?? 2,
        isActive: true,
        createdBy: actorId,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'MP_ROUTE_POLICY_CREATED', objectType: 'MpRoutePolicy', objectId: policy.id, newValue: { name: policy.name } });
    return policy;
  }

  async list(companyId: string) {
    return this.prisma.mpRoutePolicy.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, policyId: string) {
    const p = await this.prisma.mpRoutePolicy.findUnique({ where: { id: policyId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Route policy not found');
    return p;
  }

  async deactivate(companyId: string, actorId: string, policyId: string) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.mpRoutePolicy.findUnique({ where: { id: policyId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Route policy not found');
    await this.prisma.mpRoutePolicy.update({ where: { id: policyId }, data: { isActive: false } });
    await this.audit.record({ companyId, actorId, action: 'MP_ROUTE_POLICY_DEACTIVATED', objectType: 'MpRoutePolicy', objectId: policyId });
    return { id: policyId, isActive: false };
  }
}
