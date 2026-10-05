import { Injectable, ForbiddenException, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaAuditService } from './ca-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class CaPerformanceService {
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

  async record(companyId: string, actorId: string, allocationId: string, dto: {
    period: string; actualReturnMc?: number; expectedReturnMc?: number;
    varianceMc?: number; notes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const alloc = await this.prisma.caAuthorizedAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    if (dto.actualReturnMc !== undefined && !Number.isInteger(dto.actualReturnMc)) throw new BadRequestException('actualReturnMc must be an integer');
    if (dto.expectedReturnMc !== undefined && !Number.isInteger(dto.expectedReturnMc)) throw new BadRequestException('expectedReturnMc must be an integer');
    if (dto.varianceMc !== undefined && !Number.isInteger(dto.varianceMc)) throw new BadRequestException('varianceMc must be an integer');
    try {
      return await this.prisma.caAllocationPerformance.create({
        data: {
          companyId, allocationId, period: dto.period,
          actualReturnMc: dto.actualReturnMc, expectedReturnMc: dto.expectedReturnMc,
          varianceMc: dto.varianceMc, notes: dto.notes,
          recordedBy: actorId, isAdvisory: true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException(`Performance already recorded for period ${dto.period}`);
      throw e;
    }
  }

  async list(companyId: string, allocationId: string) {
    const alloc = await this.prisma.caAuthorizedAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc || alloc.companyId !== companyId) throw new NotFoundException('Allocation not found');
    return this.prisma.caAllocationPerformance.findMany({ where: { companyId, allocationId }, orderBy: { period: 'asc' } });
  }
}
