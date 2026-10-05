import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfReleaseEnv, EmployeeStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PfReleaseService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, productId: string, dto: {
    versionRef: string;
    environment: PfReleaseEnv;
    buildReference?: string;
    qaRecordId?: string;
    securityReviewId?: string;
    approvalId?: string;
    notes?: string;
    idempotencyKey?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    // Kill switch applies to all environments — fails closed
    const ks = await this.prisma.killSwitchConfig.findFirst({
      where: { companyId, feature: 'PF_AUTOMATED_RELEASE', isDisabled: true },
    });
    if (ks) throw new ForbiddenException('Product release kill switch is active');

    // PRODUCTION requires QA evidence and security clearance
    if (dto.environment === PfReleaseEnv.PRODUCTION) {
      if (!dto.qaRecordId) throw new BadRequestException('Production release requires qaRecordId');
      if (!dto.securityReviewId) throw new BadRequestException('Production release requires securityReviewId');

      const qa = await this.prisma.pfQARecord.findUnique({ where: { id: dto.qaRecordId } });
      if (!qa || qa.companyId !== companyId || qa.productId !== productId)
        throw new BadRequestException('QA record not valid for this product');
      if (!qa.overallReady) throw new BadRequestException('QA not passed — cannot release to PRODUCTION');

      const sr = await this.prisma.pfSecurityReview.findUnique({ where: { id: dto.securityReviewId } });
      if (!sr || sr.companyId !== companyId || sr.productId !== productId)
        throw new BadRequestException('Security review not valid for this product');
      if (sr.status !== 'CLEARED') throw new BadRequestException('Security review not cleared — cannot release to PRODUCTION');
    }

    const iKey = dto.idempotencyKey ?? crypto.randomUUID();
    // Idempotency: return existing if same key
    const existing = await this.prisma.pfProductRelease.findUnique({ where: { idempotencyKey: iKey } });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key conflict');
      return existing;
    }

    let release: any;
    try {
      release = await this.prisma.pfProductRelease.create({
        data: {
          companyId, productId,
          versionRef: dto.versionRef,
          environment: dto.environment,
          buildReference: dto.buildReference,
          qaRecordId: dto.qaRecordId,
          securityReviewId: dto.securityReviewId,
          approvalId: dto.approvalId,
          releasedBy: actorId,
          releasedAt: new Date(),
          idempotencyKey: iKey,
          notes: dto.notes,
          isAdvisory: true,
        },
      });
    } catch (err: any) {
      // P2002 = unique constraint — concurrent request with same idempotencyKey won the race
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const concurrent = await this.prisma.pfProductRelease.findUnique({ where: { idempotencyKey: iKey } });
        if (!concurrent) throw err; // should not happen
        if (concurrent.companyId !== companyId) throw new ForbiddenException('Idempotency key conflict');
        return concurrent;
      }
      throw err;
    }
    await this.audit.record({ companyId, actorId, productId, action: 'PF_RELEASE_CREATED', objectType: 'PfProductRelease', objectId: release.id, newValue: { environment: dto.environment, versionRef: dto.versionRef } });
    return release;
  }

  async list(companyId: string, productId: string, environment?: PfReleaseEnv) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfProductRelease.findMany({
      where: { companyId, productId, ...(environment ? { environment } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, releaseId: string) {
    const r = await this.prisma.pfProductRelease.findUnique({ where: { id: releaseId } });
    if (!r || r.companyId !== companyId) throw new NotFoundException('Release not found');
    return r;
  }
}
