import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { MpKillSwitchScope, EmployeeStatus } from '@prisma/client';

@Injectable()
export class MpKillSwitchService {
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

  /** Fail-closed: ANY active, non-expired kill switch matching scope blocks inference */
  async isBlocked(companyId: string, opts: { providerId?: string; modelId?: string; scope?: MpKillSwitchScope }): Promise<boolean> {
    const now = new Date();
    const switches = await this.prisma.mpKillSwitch.findMany({
      where: {
        companyId,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { scope: MpKillSwitchScope.ALL_INFERENCE },
              ...(opts.providerId ? [{ scope: MpKillSwitchScope.PROVIDER, providerId: opts.providerId }] : []),
              ...(opts.modelId ? [{ scope: MpKillSwitchScope.MODEL, modelId: opts.modelId }] : []),
            ],
          },
        ],
      },
    });
    return switches.length > 0;
  }

  async activate(companyId: string, actorId: string, dto: {
    scope: MpKillSwitchScope;
    reason: string;
    providerId?: string;
    modelId?: string;
    expiresAt?: Date;
  }) {
    await this.verifyActor(actorId, companyId);

    if (dto.scope === MpKillSwitchScope.PROVIDER && !dto.providerId)
      throw new BadRequestException('providerId required for PROVIDER scope');
    if (dto.scope === MpKillSwitchScope.MODEL && !dto.modelId)
      throw new BadRequestException('modelId required for MODEL scope');

    if (dto.providerId) {
      const p = await this.prisma.mpProvider.findUnique({ where: { id: dto.providerId } });
      if (!p || p.companyId !== companyId) throw new NotFoundException('Provider not found');
    }
    if (dto.modelId) {
      const m = await this.prisma.mpModel.findUnique({ where: { id: dto.modelId } });
      if (!m || m.companyId !== companyId) throw new NotFoundException('Model not found');
    }

    const ks = await this.prisma.mpKillSwitch.create({
      data: {
        companyId,
        scope: dto.scope,
        reason: dto.reason,
        providerId: dto.providerId,
        modelId: dto.modelId,
        activatedBy: actorId,
        isActive: true,
        expiresAt: dto.expiresAt,
      },
    });
    await this.audit.record({ companyId, actorId, action: 'MP_KILL_SWITCH_ACTIVATED', objectType: 'MpKillSwitch', objectId: ks.id, newValue: { scope: dto.scope, reason: dto.reason } });
    return ks;
  }

  async deactivate(companyId: string, actorId: string, killSwitchId: string) {
    await this.verifyActor(actorId, companyId);
    const ks = await this.prisma.mpKillSwitch.findUnique({ where: { id: killSwitchId } });
    if (!ks || ks.companyId !== companyId) throw new NotFoundException('Kill switch not found');
    if (!ks.isActive) throw new BadRequestException('Kill switch already inactive');

    const updated = await this.prisma.mpKillSwitch.update({
      where: { id: killSwitchId },
      data: { isActive: false, deactivatedAt: new Date(), deactivatedBy: actorId },
    });
    await this.audit.record({ companyId, actorId, action: 'MP_KILL_SWITCH_DEACTIVATED', objectType: 'MpKillSwitch', objectId: killSwitchId });
    return { id: updated.id, isActive: updated.isActive };
  }

  async list(companyId: string, activeOnly = false) {
    return this.prisma.mpKillSwitch.findMany({
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
