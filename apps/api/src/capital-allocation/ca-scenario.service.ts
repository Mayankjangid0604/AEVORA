import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { CaScenarioType, EmployeeStatus } from '@prisma/client';

@Injectable()
export class CaScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CaAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async create(companyId: string, actorId: string, proposalId: string, dto: {
    scenarioType?: CaScenarioType; label?: string;
    projectedReturnMc?: number; projectedRoiPct?: number;
    timeHorizonMonths?: number; assumptions?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const proposal = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.companyId !== companyId) throw new NotFoundException('Proposal not found');
    if (dto.projectedReturnMc !== undefined && !Number.isInteger(dto.projectedReturnMc)) throw new BadRequestException('projectedReturnMc must be an integer');
    if (dto.projectedRoiPct !== undefined && !Number.isInteger(dto.projectedRoiPct)) throw new BadRequestException('projectedRoiPct must be an integer');
    if (dto.timeHorizonMonths !== undefined && !Number.isInteger(dto.timeHorizonMonths)) throw new BadRequestException('timeHorizonMonths must be an integer');
    return this.prisma.caScenario.create({
      data: {
        companyId, proposalId,
        scenarioType: dto.scenarioType ?? CaScenarioType.BASE,
        label: dto.label,
        projectedReturnMc: dto.projectedReturnMc,
        projectedRoiPct: dto.projectedRoiPct,
        timeHorizonMonths: dto.timeHorizonMonths,
        assumptions: dto.assumptions,
        createdBy: actorId,
        isAdvisory: true,
      },
    });
  }

  async list(companyId: string, proposalId: string) {
    const proposal = await this.prisma.caAllocationProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.companyId !== companyId) throw new NotFoundException('Proposal not found');
    return this.prisma.caScenario.findMany({ where: { companyId, proposalId }, orderBy: { createdAt: 'asc' } });
  }
}
