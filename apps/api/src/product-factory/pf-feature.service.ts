import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfQAStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfFeatureService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, productId: string, dto: {
    title: string;
    description?: string;
    priority?: string;
    versionRef?: string;
    ownerId?: string;
    engineeringTaskId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    // Verify ownerId is in company if provided
    if (dto.ownerId) {
      const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
      if (!owner || owner.companyId !== companyId) throw new BadRequestException('Owner not in company');
    }

    const f = await this.prisma.pfProductFeature.create({
      data: {
        companyId, productId,
        title: dto.title, description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        versionRef: dto.versionRef,
        ownerId: dto.ownerId,
        engineeringTaskId: dto.engineeringTaskId,
        createdBy: actorId, isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_FEATURE_CREATED', objectType: 'PfProductFeature', objectId: f.id });
    return f;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfProductFeature.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }

  async updateStatus(companyId: string, actorId: string, featureId: string, status: string) {
    await this.verifyActor(actorId, companyId);
    const f = await this.prisma.pfProductFeature.findUnique({ where: { id: featureId } });
    if (!f || f.companyId !== companyId) throw new NotFoundException('Feature not found');
    const VALID = ['BACKLOG', 'IN_PROGRESS', 'TESTING', 'DONE', 'CANCELLED'];
    if (!VALID.includes(status)) throw new BadRequestException('Invalid feature status');
    const updated = await this.prisma.pfProductFeature.update({ where: { id: featureId }, data: { status } });
    await this.audit.record({ companyId, actorId, productId: f.productId, action: 'PF_FEATURE_STATUS_CHANGED', objectType: 'PfProductFeature', objectId: featureId, oldValue: { status: f.status }, newValue: { status } });
    return updated;
  }

  async recordQA(companyId: string, actorId: string, featureId: string, qaStatus: PfQAStatus) {
    await this.verifyActor(actorId, companyId);
    const f = await this.prisma.pfProductFeature.findUnique({ where: { id: featureId } });
    if (!f || f.companyId !== companyId) throw new NotFoundException('Feature not found');
    const updated = await this.prisma.pfProductFeature.update({ where: { id: featureId }, data: { qaStatus } });
    await this.audit.record({ companyId, actorId, productId: f.productId, action: 'PF_FEATURE_QA_RECORDED', objectType: 'PfProductFeature', objectId: featureId, newValue: { qaStatus } });
    return updated;
  }

  async clearSecurity(companyId: string, actorId: string, featureId: string) {
    await this.verifyActor(actorId, companyId);
    const f = await this.prisma.pfProductFeature.findUnique({ where: { id: featureId } });
    if (!f || f.companyId !== companyId) throw new NotFoundException('Feature not found');
    // Cannot self-clear: actorId must differ from createdBy
    if (f.createdBy === actorId) throw new ForbiddenException('Feature creator cannot self-clear security');
    const updated = await this.prisma.pfProductFeature.update({ where: { id: featureId }, data: { securityCleared: true } });
    await this.audit.record({ companyId, actorId, productId: f.productId, action: 'PF_FEATURE_SECURITY_CLEARED', objectType: 'PfProductFeature', objectId: featureId });
    return updated;
  }
}
