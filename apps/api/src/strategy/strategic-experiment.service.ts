import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategicExperimentStatus } from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';

const EXP_TRANSITIONS: Record<StrategicExperimentStatus, StrategicExperimentStatus[]> = {
  PROPOSED:  [StrategicExperimentStatus.ACTIVE, StrategicExperimentStatus.CANCELLED],
  ACTIVE:    [StrategicExperimentStatus.COMPLETED, StrategicExperimentStatus.STOPPED, StrategicExperimentStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  STOPPED:   [],
};

@Injectable()
export class StrategicExperimentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createExperiment(companyId: string, actorId: string, dto: {
    title: string;
    hypothesis: string;
    objective: string;
    metric: string;
    expectedOutcome: string;
    resourceLimit?: number;
    duration?: number;
    stopCondition?: string;
    ownerId: string;
    initiativeId?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('Owner not found');

    if (dto.initiativeId) {
      const init = await this.prisma.strategicInitiative.findUnique({ where: { id: dto.initiativeId } });
      if (!init || init.companyId !== companyId) throw new NotFoundException('Initiative not found');
    }

    if (dto.resourceLimit !== undefined && !Number.isInteger(dto.resourceLimit)) throw new BadRequestException('resourceLimit must be integer');

    const exp = await this.prisma.strategicExperiment.create({
      data: {
        companyId,
        initiativeId: dto.initiativeId,
        title: dto.title,
        hypothesis: dto.hypothesis,
        objective: dto.objective,
        metric: dto.metric,
        expectedOutcome: dto.expectedOutcome,
        resourceLimit: dto.resourceLimit ?? 0,
        duration: dto.duration ?? 30,
        stopCondition: dto.stopCondition,
        ownerId: dto.ownerId,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_EXPERIMENT_CREATED', objectType: 'StrategicExperiment', objectId: exp.id, newValue: { title: exp.title } });
    return exp;
  }

  async advanceStatus(companyId: string, actorId: string, experimentId: string, newStatus: StrategicExperimentStatus, opts?: { actualOutcome?: string; lessonNote?: string }) {
    await this.verifyActor(actorId, companyId);
    const exp = await this.prisma.strategicExperiment.findUnique({ where: { id: experimentId } });
    if (!exp || exp.companyId !== companyId) throw new NotFoundException('Experiment not found');

    const allowed = EXP_TRANSITIONS[exp.status];
    if (!allowed.includes(newStatus)) throw new BadRequestException(`Cannot transition from ${exp.status} to ${newStatus}`);

    const updated = await this.prisma.strategicExperiment.update({
      where: { id: experimentId },
      data: {
        status: newStatus,
        actualOutcome: opts?.actualOutcome,
        lessonNote: opts?.lessonNote,
        ...(newStatus === StrategicExperimentStatus.ACTIVE ? { startedAt: new Date() } : {}),
        ...(newStatus === StrategicExperimentStatus.COMPLETED || newStatus === StrategicExperimentStatus.STOPPED ? { completedAt: new Date() } : {}),
      },
    });
    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_EXPERIMENT_STATUS_CHANGED', objectType: 'StrategicExperiment', objectId: experimentId, oldValue: { status: exp.status }, newValue: { status: newStatus } });
    return updated;
  }

  async getExperiments(companyId: string, status?: StrategicExperimentStatus) {
    return this.prisma.strategicExperiment.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
