import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiAuditService } from './fi-audit.service';
import { EmployeeStatus, FiDatasetStatus } from '@prisma/client';

@Injectable()
export class FiDatasetService {
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

  async create(companyId: string, actorId: string, dto: {
    name: string; description?: string; version?: string;
    sourceRef?: string; recordCount?: number; sizeBytes?: number; provenance?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    try {
      const dataset = await this.prisma.fiDataset.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description,
          version: dto.version ?? '1.0.0',
          sourceRef: dto.sourceRef,
          recordCount: dto.recordCount,
          sizeBytes: dto.sizeBytes,
          provenance: dto.provenance,
          hasSecrets: false, // hardcoded — caller cannot set true
          isAdvisory: true,
          createdBy: actorId,
          status: FiDatasetStatus.DRAFT,
        },
      });
      await this.audit.record({ companyId, actorId, datasetId: dataset.id, action: 'FI_DATASET_CREATED', objectType: 'FiDataset', objectId: dataset.id, newValue: { name: dataset.name } });
      return dataset;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Dataset with this name and version already exists');
      throw e;
    }
  }

  async validate(companyId: string, actorId: string, datasetId: string) {
    await this.verifyActor(actorId, companyId);
    const dataset = await this.prisma.fiDataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.companyId !== companyId) throw new NotFoundException('Dataset not found');
    if (dataset.status !== FiDatasetStatus.DRAFT && dataset.status !== FiDatasetStatus.VALIDATING) {
      throw new BadRequestException('Dataset must be DRAFT or VALIDATING to validate');
    }
    if (dataset.hasSecrets) throw new BadRequestException('Dataset has secrets; cannot be validated');
    // DRAFT→VALIDATING→VALIDATED
    const updated = await this.prisma.fiDataset.update({
      where: { id: datasetId },
      data: { status: FiDatasetStatus.VALIDATED, validatedBy: actorId },
    });
    await this.audit.record({ companyId, actorId, datasetId, action: 'FI_DATASET_VALIDATED', objectType: 'FiDataset', objectId: datasetId });
    return updated;
  }

  async reject(companyId: string, actorId: string, datasetId: string, reason: string) {
    await this.verifyActor(actorId, companyId);
    const dataset = await this.prisma.fiDataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.companyId !== companyId) throw new NotFoundException('Dataset not found');
    if (dataset.status === FiDatasetStatus.ARCHIVED || dataset.status === FiDatasetStatus.REJECTED) {
      throw new BadRequestException('Dataset already rejected or archived');
    }
    const updated = await this.prisma.fiDataset.update({
      where: { id: datasetId },
      data: { status: FiDatasetStatus.REJECTED, rejectedBy: actorId, rejectionReason: reason },
    });
    await this.audit.record({ companyId, actorId, datasetId, action: 'FI_DATASET_REJECTED', objectType: 'FiDataset', objectId: datasetId, newValue: { reason } });
    return updated;
  }

  async list(companyId: string, status?: FiDatasetStatus) {
    return this.prisma.fiDataset.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, datasetId: string) {
    const dataset = await this.prisma.fiDataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.companyId !== companyId) throw new NotFoundException('Dataset not found');
    return dataset;
  }

  async update(companyId: string, actorId: string, datasetId: string, dto: {
    name?: string; description?: string; sourceRef?: string;
    recordCount?: number; sizeBytes?: number; provenance?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const dataset = await this.prisma.fiDataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.companyId !== companyId) throw new NotFoundException('Dataset not found');
    if (dataset.status === FiDatasetStatus.ARCHIVED || dataset.status === FiDatasetStatus.REJECTED) {
      throw new BadRequestException('Cannot update ARCHIVED or REJECTED dataset');
    }
    // explicit whitelist — no hasSecrets, isAdvisory, status, companyId, createdBy
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.sourceRef !== undefined) data.sourceRef = dto.sourceRef;
    if (dto.recordCount !== undefined) data.recordCount = dto.recordCount;
    if (dto.sizeBytes !== undefined) data.sizeBytes = dto.sizeBytes;
    if (dto.provenance !== undefined) data.provenance = dto.provenance;
    try {
      const updated = await this.prisma.fiDataset.update({ where: { id: datasetId }, data });
      await this.audit.record({ companyId, actorId, datasetId, action: 'FI_DATASET_UPDATED', objectType: 'FiDataset', objectId: datasetId });
      return updated;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Dataset with this name and version already exists');
      throw e;
    }
  }
}
