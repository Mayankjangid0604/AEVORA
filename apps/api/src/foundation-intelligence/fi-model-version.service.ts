import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiAuditService } from './fi-audit.service';
import { EmployeeStatus, FiModelStatus } from '@prisma/client';

const STATUS_ORDER: FiModelStatus[] = [
  FiModelStatus.EXPERIMENTAL,
  FiModelStatus.EVALUATED,
  FiModelStatus.APPROVED,
  FiModelStatus.PRODUCTION,
];

@Injectable()
export class FiModelVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FiAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  private async killSwitch(feature: string) {
    const ks = await this.prisma.killSwitchConfig.findFirst({ where: { companyId: null, feature, isDisabled: true } });
    return !!ks;
  }

  async create(companyId: string, actorId: string, dto: {
    family: string; version: string; jobId?: string;
    description?: string; artifactRef?: string; parentVersionId?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    try {
      const model = await this.prisma.fiModelVersion.create({
        data: {
          companyId,
          family: dto.family,
          version: dto.version,
          jobId: dto.jobId,
          description: dto.description,
          artifactRef: dto.artifactRef,
          parentVersionId: dto.parentVersionId,
          isAdvisory: true,
          proposedBy: actorId,
          status: FiModelStatus.EXPERIMENTAL,
        },
      });
      await this.audit.record({ companyId, actorId, action: 'FI_MODEL_CREATED', objectType: 'FiModelVersion', objectId: model.id, newValue: { family: model.family, version: model.version } });
      return model;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Model version already exists');
      throw e;
    }
  }

  async promote(companyId: string, actorId: string, modelVersionId: string, targetStatus: FiModelStatus) {
    await this.verifyActor(actorId, companyId);
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new NotFoundException('Model version not found');
    if (model.status === FiModelStatus.RETIRED) throw new BadRequestException('Cannot promote a RETIRED model');

    const currentIdx = STATUS_ORDER.indexOf(model.status);
    const targetIdx = STATUS_ORDER.indexOf(targetStatus);
    if (targetIdx === -1) throw new BadRequestException('Invalid target status');
    if (targetIdx !== currentIdx + 1) throw new BadRequestException('Invalid state transition — forward only, no skipping');

    // Self-promotion to PRODUCTION blocked
    if (targetStatus === FiModelStatus.PRODUCTION && model.proposedBy === actorId) {
      throw new ForbiddenException('Cannot self-promote model to PRODUCTION');
    }
    // Kill switch for PRODUCTION promotion
    if (targetStatus === FiModelStatus.PRODUCTION && await this.killSwitch('FI_MODEL_PROMOTION')) {
      throw new ForbiddenException('Kill switch FI_MODEL_PROMOTION active');
    }

    const data: any = { status: targetStatus };
    if (targetStatus === FiModelStatus.APPROVED) {
      data.approvedBy = actorId;
      data.approvedAt = new Date();
    }
    if (targetStatus === FiModelStatus.PRODUCTION) {
      data.isAdvisory = false; // governed production record
    }
    const updated = await this.prisma.fiModelVersion.update({ where: { id: modelVersionId }, data });
    await this.audit.record({ companyId, actorId, action: 'FI_MODEL_PROMOTED', objectType: 'FiModelVersion', objectId: modelVersionId, newValue: { status: targetStatus } });
    return updated;
  }

  async retire(companyId: string, actorId: string, modelVersionId: string) {
    await this.verifyActor(actorId, companyId);
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new NotFoundException('Model version not found');
    const updated = await this.prisma.fiModelVersion.update({
      where: { id: modelVersionId },
      data: { status: FiModelStatus.RETIRED, retiredBy: actorId, retiredAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, action: 'FI_MODEL_RETIRED', objectType: 'FiModelVersion', objectId: modelVersionId });
    return updated;
  }

  async list(companyId: string, family?: string, status?: FiModelStatus) {
    return this.prisma.fiModelVersion.findMany({
      where: { companyId, ...(family ? { family } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, modelVersionId: string) {
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new NotFoundException('Model version not found');
    return model;
  }

  async update(companyId: string, actorId: string, modelVersionId: string, dto: {
    description?: string; artifactRef?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const model = await this.prisma.fiModelVersion.findUnique({ where: { id: modelVersionId } });
    if (!model || model.companyId !== companyId) throw new NotFoundException('Model version not found');
    const data: any = {};
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.artifactRef !== undefined) data.artifactRef = dto.artifactRef;
    return this.prisma.fiModelVersion.update({ where: { id: modelVersionId }, data });
  }
}
