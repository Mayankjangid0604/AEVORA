import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfLaunchStatus, EmployeeStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class PfLaunchService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, productId: string, dto: {
    releaseId: string;
    launchPlan?: string;
    idempotencyKey?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    const release = await this.prisma.pfProductRelease.findUnique({ where: { id: dto.releaseId } });
    if (!release || release.companyId !== companyId || release.productId !== productId)
      throw new BadRequestException('Release not valid for this product');

    const iKey = dto.idempotencyKey ?? crypto.randomUUID();
    const existing = await this.prisma.pfProductLaunch.findUnique({ where: { idempotencyKey: iKey } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key conflict');
      return existing;
    }

    let launch: any;
    try {
      launch = await this.prisma.pfProductLaunch.create({
        data: {
          companyId, productId,
          releaseId: dto.releaseId,
          launchPlan: dto.launchPlan,
          status: PfLaunchStatus.PLANNED,
          idempotencyKey: iKey,
          isAdvisory: true,
        },
      });
    } catch (err: any) {
      // P2002 = concurrent request with same idempotencyKey won the race
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const concurrent = await this.prisma.pfProductLaunch.findUnique({ where: { idempotencyKey: iKey } });
        if (!concurrent) throw err;
        if (concurrent.companyId !== companyId) throw new ForbiddenException('Idempotency key conflict');
        return concurrent;
      }
      throw err;
    }
    await this.audit.record({ companyId, actorId, productId, action: 'PF_LAUNCH_CREATED', objectType: 'PfProductLaunch', objectId: launch.id });
    return launch;
  }

  async approve(companyId: string, actorId: string, launchId: string) {
    await this.verifyActor(actorId, companyId);
    const launch = await this.prisma.pfProductLaunch.findUnique({ where: { id: launchId } });
    if (!launch || launch.companyId !== companyId) throw new NotFoundException('Launch not found');
    if (launch.status !== PfLaunchStatus.PLANNED) throw new BadRequestException('Launch not in PLANNED state');

    const updated = await this.prisma.pfProductLaunch.update({
      where: { id: launchId },
      data: { status: PfLaunchStatus.READY, approvedBy: actorId, approvedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, productId: launch.productId, action: 'PF_LAUNCH_APPROVED', objectType: 'PfProductLaunch', objectId: launchId });
    return updated;
  }

  async execute(companyId: string, actorId: string, launchId: string) {
    await this.verifyActor(actorId, companyId);
    const launch = await this.prisma.pfProductLaunch.findUnique({ where: { id: launchId } });
    if (!launch || launch.companyId !== companyId) throw new NotFoundException('Launch not found');
    if (launch.status !== PfLaunchStatus.READY) throw new BadRequestException('Launch must be READY before execution');
    if (!launch.approvedBy) throw new BadRequestException('Launch not approved');

    // Kill switch check
    const ks = await this.prisma.killSwitchConfig.findFirst({
      where: { companyId, feature: 'PF_AUTOMATED_LAUNCH', isDisabled: true },
    });
    if (ks) throw new ForbiddenException('Launch kill switch is active');

    const updated = await this.prisma.pfProductLaunch.update({
      where: { id: launchId },
      data: { status: PfLaunchStatus.LAUNCHED, launchedBy: actorId, launchedAt: new Date(), isAdvisory: false },
    });
    await this.audit.record({ companyId, actorId, productId: launch.productId, action: 'PF_LAUNCH_EXECUTED', objectType: 'PfProductLaunch', objectId: launchId });
    return updated;
  }

  async rollback(companyId: string, actorId: string, launchId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    const launch = await this.prisma.pfProductLaunch.findUnique({ where: { id: launchId } });
    if (!launch || launch.companyId !== companyId) throw new NotFoundException('Launch not found');
    if (launch.status !== PfLaunchStatus.LAUNCHED) throw new BadRequestException('Can only rollback a LAUNCHED product');
    if (!reason?.trim()) throw new BadRequestException('Rollback reason is required');

    const updated = await this.prisma.pfProductLaunch.update({
      where: { id: launchId },
      data: { status: PfLaunchStatus.ROLLED_BACK, rolledBackBy: actorId, rolledBackAt: new Date(), rollbackReason: reason },
    });
    await this.audit.record({ companyId, actorId, productId: launch.productId, action: 'PF_LAUNCH_ROLLED_BACK', objectType: 'PfProductLaunch', objectId: launchId, newValue: { reason } });
    return updated;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfProductLaunch.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }
}
