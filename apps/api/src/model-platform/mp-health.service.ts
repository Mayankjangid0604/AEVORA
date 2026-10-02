import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { MpProviderStatus, MpModelStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class MpHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async recordProviderHealth(companyId: string, actorId: string, providerId: string, data: {
    isHealthy: boolean;
    p50LatencyMs?: number;
    errorRateBps?: number;
    notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.mpProvider.findUnique({ where: { id: providerId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Provider not found');

    const status = data.isHealthy ? 'HEALTHY' : 'UNHEALTHY';
    const health = await this.prisma.mpProviderHealth.create({
      data: {
        companyId,
        providerId,
        status,
        p50LatencyMs: data.p50LatencyMs,
        errorRateBps: data.errorRateBps ?? 0,
        notes: data.notes,
        lastCheckedAt: new Date(),
      },
    });

    // Auto-update provider status
    const newProvStatus = data.isHealthy ? MpProviderStatus.ACTIVE : MpProviderStatus.DEGRADED;
    if (p.status !== newProvStatus) {
      await this.prisma.mpProvider.update({ where: { id: providerId }, data: { status: newProvStatus } });
      await this.audit.record({ companyId, actorId, action: 'MP_PROVIDER_HEALTH_STATUS_CHANGED', objectType: 'MpProvider', objectId: providerId, oldValue: { status: p.status }, newValue: { status: newProvStatus } });
    }

    return health;
  }

  async recordModelHealth(companyId: string, actorId: string, modelId: string, data: {
    isHealthy: boolean;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
    errorRateBps?: number;
    successCount?: number;
    failureCount?: number;
  }) {
    await this.verifyActor(actorId, companyId);
    const m = await this.prisma.mpModel.findUnique({ where: { id: modelId } });
    if (!m || m.companyId !== companyId) throw new NotFoundException('Model not found');

    const status = data.isHealthy ? 'HEALTHY' : 'UNHEALTHY';
    const health = await this.prisma.mpModelHealth.create({
      data: {
        companyId, modelId, status,
        p50LatencyMs: data.p50LatencyMs,
        p95LatencyMs: data.p95LatencyMs,
        errorRateBps: data.errorRateBps ?? 0,
        successCount: data.successCount ?? 0,
        failureCount: data.failureCount ?? 0,
      },
    });

    const newStatus = data.isHealthy ? MpModelStatus.ACTIVE : MpModelStatus.DEGRADED;
    if (m.status === MpModelStatus.ACTIVE || m.status === MpModelStatus.DEGRADED) {
      if (m.status !== newStatus) {
        await this.prisma.mpModel.update({ where: { id: modelId }, data: { status: newStatus } });
      }
    }

    return health;
  }

  async getProviderHealth(companyId: string, providerId: string, limit = 20) {
    const p = await this.prisma.mpProvider.findUnique({ where: { id: providerId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Provider not found');
    return this.prisma.mpProviderHealth.findMany({
      where: { companyId, providerId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async getModelHealth(companyId: string, modelId: string, limit = 20) {
    const m = await this.prisma.mpModel.findUnique({ where: { id: modelId } });
    if (!m || m.companyId !== companyId) throw new NotFoundException('Model not found');
    return this.prisma.mpModelHealth.findMany({
      where: { companyId, modelId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }
}
