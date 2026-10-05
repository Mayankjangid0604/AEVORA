import {
  Injectable, ForbiddenException, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmployeeStatus, StrategicInitiativeStatus, StrategicHorizon,
  StrategicReversibility,
} from '@prisma/client';
import { ManagementAuditService } from '../management/management-audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

const TRANSITIONS: Record<StrategicInitiativeStatus, StrategicInitiativeStatus[]> = {
  PROPOSED:   [StrategicInitiativeStatus.EVALUATING, StrategicInitiativeStatus.CANCELLED],
  EVALUATING: [StrategicInitiativeStatus.APPROVED, StrategicInitiativeStatus.CANCELLED],
  APPROVED:   [StrategicInitiativeStatus.ACTIVE, StrategicInitiativeStatus.CANCELLED],
  ACTIVE:     [StrategicInitiativeStatus.PAUSED, StrategicInitiativeStatus.COMPLETED, StrategicInitiativeStatus.FAILED, StrategicInitiativeStatus.CANCELLED],
  PAUSED:     [StrategicInitiativeStatus.ACTIVE, StrategicInitiativeStatus.CANCELLED],
  COMPLETED:  [],
  CANCELLED:  [],
  FAILED:     [],
};

@Injectable()
export class StrategicInitiativeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
    private readonly authz: AuthorizationService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createInitiative(companyId: string, actorId: string, dto: {
    title: string;
    description?: string;
    rationale?: string;
    ownerId: string;
    objectiveId?: string;
    themeId?: string;
    horizon?: StrategicHorizon;
    reversibility?: StrategicReversibility;
    estimatedCost?: number;
    resources?: unknown[];
    assumptions?: unknown[];
    risks?: unknown[];
    dependencies?: unknown[];
    confidence?: number;
    expectedBenefit?: unknown;
  }) {
    await this.verifyActor(actorId, companyId);

    const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
    if (!owner || owner.companyId !== companyId) throw new NotFoundException('Owner not found in company');

    if (dto.objectiveId) {
      const obj = await this.prisma.companyObjective.findUnique({ where: { id: dto.objectiveId } });
      if (!obj || obj.companyId !== companyId) throw new NotFoundException('Objective not found');
    }

    if (dto.themeId) {
      const theme = await this.prisma.strategicTheme.findUnique({ where: { id: dto.themeId } });
      if (!theme || theme.companyId !== companyId) throw new NotFoundException('Theme not found');
    }

    if (dto.estimatedCost !== undefined && !Number.isInteger(dto.estimatedCost)) {
      throw new BadRequestException('estimatedCost must be an integer');
    }

    if (dto.confidence !== undefined && (dto.confidence < 0 || dto.confidence > 100)) {
      throw new BadRequestException('confidence must be 0-100');
    }

    const initiative = await this.prisma.strategicInitiative.create({
      data: {
        companyId,
        title: dto.title,
        description: dto.description,
        rationale: dto.rationale,
        ownerId: dto.ownerId,
        objectiveId: dto.objectiveId,
        themeId: dto.themeId,
        horizon: dto.horizon ?? StrategicHorizon.MEDIUM_TERM,
        reversibility: dto.reversibility ?? StrategicReversibility.REVERSIBLE,
        estimatedCost: dto.estimatedCost ?? 0,
        resources: (dto.resources ?? []) as any,
        assumptions: (dto.assumptions ?? []) as any,
        risks: (dto.risks ?? []) as any,
        dependencies: (dto.dependencies ?? []) as any,
        confidence: dto.confidence ?? 50,
        expectedBenefit: (dto.expectedBenefit ?? {}) as any,
        isAdvisory: true,
      },
    });

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_INITIATIVE_CREATED', objectType: 'StrategicInitiative', objectId: initiative.id, newValue: { title: initiative.title, horizon: initiative.horizon } });
    return initiative;
  }

  async advanceStatus(companyId: string, actorId: string, initiativeId: string, newStatus: StrategicInitiativeStatus, opts?: { evidenceNote?: string; outcomeData?: unknown }) {
    await this.verifyActor(actorId, companyId);

    const initiative = await this.prisma.strategicInitiative.findUnique({ where: { id: initiativeId } });
    if (!initiative || initiative.companyId !== companyId) throw new NotFoundException('Initiative not found');

    const allowed = TRANSITIONS[initiative.status];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from ${initiative.status} to ${newStatus}`);
    }

    // Self-approval prevention: initiative owner cannot approve their own initiative
    if (newStatus === StrategicInitiativeStatus.APPROVED && initiative.ownerId === actorId) {
      throw new ForbiddenException('Initiative owner cannot approve their own initiative');
    }

    // IRREVERSIBLE initiatives require Chairman-level approval
    if (newStatus === StrategicInitiativeStatus.APPROVED && initiative.reversibility === StrategicReversibility.IRREVERSIBLE) {
      await this.authz.checkPermission(actorId, 'CHAIRMAN_ONLY', companyId);
    }

    const updated = await this.prisma.strategicInitiative.update({
      where: { id: initiativeId },
      data: {
        status: newStatus,
        evidenceNote: opts?.evidenceNote,
        outcomeData: (opts?.outcomeData ?? undefined) as any,
        ...(newStatus === StrategicInitiativeStatus.APPROVED ? { approvedById: actorId, approvedAt: new Date(), isAdvisory: false } : {}),
        ...(newStatus === StrategicInitiativeStatus.ACTIVE ? { startedAt: new Date() } : {}),
        ...(newStatus === StrategicInitiativeStatus.COMPLETED || newStatus === StrategicInitiativeStatus.FAILED ? { completedAt: new Date() } : {}),
      },
    });

    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_INITIATIVE_STATUS_CHANGED', objectType: 'StrategicInitiative', objectId: initiativeId, oldValue: { status: initiative.status }, newValue: { status: newStatus } });
    return updated;
  }

  async recordOutcome(companyId: string, actorId: string, initiativeId: string, outcomeData: unknown, lessonNote: string) {
    await this.verifyActor(actorId, companyId);
    const initiative = await this.prisma.strategicInitiative.findUnique({ where: { id: initiativeId } });
    if (!initiative || initiative.companyId !== companyId) throw new NotFoundException('Initiative not found');
    if (initiative.status !== StrategicInitiativeStatus.COMPLETED && initiative.status !== StrategicInitiativeStatus.FAILED) {
      throw new BadRequestException('Outcome can only be recorded for COMPLETED or FAILED initiatives');
    }

    const updated = await this.prisma.strategicInitiative.update({
      where: { id: initiativeId },
      data: { outcomeData: outcomeData as any, evidenceNote: lessonNote },
    });
    await this.audit.record({ companyId, actorId, action: 'STRATEGIC_INITIATIVE_OUTCOME_RECORDED', objectType: 'StrategicInitiative', objectId: initiativeId, newValue: { outcomeData } });
    return updated;
  }

  async getInitiatives(companyId: string, status?: StrategicInitiativeStatus, horizon?: StrategicHorizon) {
    return this.prisma.strategicInitiative.findMany({
      where: { companyId, ...(status ? { status } : {}), ...(horizon ? { horizon } : {}) },
      orderBy: [{ horizon: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getInitiative(companyId: string, initiativeId: string) {
    const i = await this.prisma.strategicInitiative.findUnique({ where: { id: initiativeId }, include: { options: true, scenarios: true, forecasts: true, experiments: true } });
    if (!i || i.companyId !== companyId) throw new NotFoundException('Initiative not found');
    return i;
  }
}
