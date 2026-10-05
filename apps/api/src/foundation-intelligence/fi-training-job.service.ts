import {
  Injectable, ForbiddenException, NotFoundException,
  BadRequestException, 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FiAuditService } from './fi-audit.service';
import { EmployeeStatus, FiDatasetStatus, FiTrainingJobStatus } from '@prisma/client';

@Injectable()
export class FiTrainingJobService {
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

  async create(companyId: string, actorId: string, datasetId: string, dto: {
    name: string; description?: string; jobType?: string;
    baseModelRef?: string; hyperparams?: any;
    resourceLimitCpu?: number; resourceLimitMemMb?: number;
    idempotencyKey: string;
  }) {
    await this.verifyActor(actorId, companyId);
    // validate dataset
    const dataset = await this.prisma.fiDataset.findUnique({ where: { id: datasetId } });
    if (!dataset || dataset.companyId !== companyId) throw new ForbiddenException('Dataset not in company');
    if (dataset.status !== FiDatasetStatus.VALIDATED) throw new BadRequestException('Dataset must be VALIDATED');
    if (dataset.hasSecrets) throw new BadRequestException('Dataset has secrets');
    // integer guards
    if (dto.resourceLimitCpu !== undefined) {
      if (!Number.isInteger(dto.resourceLimitCpu) || dto.resourceLimitCpu <= 0)
        throw new BadRequestException('resourceLimitCpu must be a positive integer');
    }
    if (dto.resourceLimitMemMb !== undefined) {
      if (!Number.isInteger(dto.resourceLimitMemMb) || dto.resourceLimitMemMb <= 0)
        throw new BadRequestException('resourceLimitMemMb must be a positive integer');
    }
    try {
      const job = await this.prisma.fiTrainingJob.create({
        data: {
          companyId, datasetId,
          name: dto.name, description: dto.description,
          jobType: dto.jobType ?? 'FINE_TUNE',
          baseModelRef: dto.baseModelRef,
          hyperparams: dto.hyperparams,
          resourceLimitCpu: dto.resourceLimitCpu,
          resourceLimitMemMb: dto.resourceLimitMemMb,
          isAdvisory: true,
          createdBy: actorId,
          idempotencyKey: dto.idempotencyKey,
          status: FiTrainingJobStatus.QUEUED,
        },
      });
      return job;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const existing = await this.prisma.fiTrainingJob.findUnique({ where: { idempotencyKey: dto.idempotencyKey } });
        if (!existing || existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to another company');
        return existing;
      }
      throw e;
    }
  }

  async start(companyId: string, actorId: string, jobId: string) {
    await this.verifyActor(actorId, companyId);
    if (await this.killSwitch('FI_TRAINING_JOBS')) throw new ForbiddenException('Kill switch FI_TRAINING_JOBS active');
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException('Job not found');
    if (job.status !== FiTrainingJobStatus.QUEUED) throw new BadRequestException('Job must be QUEUED to start');
    return this.prisma.fiTrainingJob.update({ where: { id: jobId }, data: { status: FiTrainingJobStatus.RUNNING, startedAt: new Date() } });
  }

  async complete(companyId: string, actorId: string, jobId: string, _dto: { artifactRef?: string }) {
    await this.verifyActor(actorId, companyId);
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException('Job not found');
    if (job.status !== FiTrainingJobStatus.RUNNING) throw new BadRequestException('Job must be RUNNING to complete');
    return this.prisma.fiTrainingJob.update({ where: { id: jobId }, data: { status: FiTrainingJobStatus.COMPLETED, completedAt: new Date() } });
  }

  async fail(companyId: string, actorId: string, jobId: string, errorMessage: string) {
    await this.verifyActor(actorId, companyId);
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException('Job not found');
    if (job.status !== FiTrainingJobStatus.RUNNING) throw new BadRequestException('Job must be RUNNING to fail');
    return this.prisma.fiTrainingJob.update({ where: { id: jobId }, data: { status: FiTrainingJobStatus.FAILED, errorMessage } });
  }

  async cancel(companyId: string, actorId: string, jobId: string) {
    await this.verifyActor(actorId, companyId);
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException('Job not found');
    if (job.status !== FiTrainingJobStatus.QUEUED && job.status !== FiTrainingJobStatus.RUNNING) {
      throw new BadRequestException('Job must be QUEUED or RUNNING to cancel');
    }
    return this.prisma.fiTrainingJob.update({ where: { id: jobId }, data: { status: FiTrainingJobStatus.CANCELLED, cancelledBy: actorId } });
  }

  async list(companyId: string, status?: FiTrainingJobStatus) {
    return this.prisma.fiTrainingJob.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, jobId: string) {
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new NotFoundException('Job not found');
    return job;
  }
}
