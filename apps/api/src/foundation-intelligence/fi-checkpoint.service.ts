import {
  Injectable, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class FiCheckpointService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, jobId: string, dto: {
    step: number; epochPct?: number; loss?: string; metrics?: any; artifactRef?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new ForbiddenException('Job not in company');
    if (dto.epochPct !== undefined) {
      if (!Number.isInteger(dto.epochPct) || dto.epochPct < 0 || dto.epochPct > 100) {
        throw new BadRequestException('epochPct must be an integer 0-100');
      }
    }
    return this.prisma.fiCheckpoint.create({
      data: {
        companyId, jobId,
        step: dto.step,
        epochPct: dto.epochPct,
        loss: dto.loss,
        metrics: dto.metrics,
        artifactRef: dto.artifactRef,
        isAdvisory: true,
        createdBy: actorId,
      },
    });
  }

  async list(companyId: string, jobId: string) {
    const job = await this.prisma.fiTrainingJob.findUnique({ where: { id: jobId } });
    if (!job || job.companyId !== companyId) throw new ForbiddenException('Job not in company');
    return this.prisma.fiCheckpoint.findMany({
      where: { companyId, jobId },
      orderBy: { step: 'asc' },
    });
  }
}
