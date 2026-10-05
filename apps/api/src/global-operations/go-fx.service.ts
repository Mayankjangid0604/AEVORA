import {
  Injectable, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class GoFxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: GoAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async record(companyId: string, actorId: string, dto: {
    fromCurrency: string; toCurrency: string; rateMc: number;
    effectiveAt: Date; source?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    if (!Number.isInteger(dto.rateMc)) throw new BadRequestException('rateMc must be an integer');
    if (dto.rateMc <= 0) throw new BadRequestException('rateMc must be positive');
    const rate = await this.prisma.goFxRate.create({
      data: {
        companyId, fromCurrency: dto.fromCurrency, toCurrency: dto.toCurrency,
        rateMc: dto.rateMc, effectiveAt: dto.effectiveAt,
        source: dto.source, isAdvisory: true, createdBy: actorId,
        // NEVER writes to Finance models — FX rates are advisory references
      },
    });
    await this.audit.record({ companyId, actorId, action: 'GO_FX_RECORDED', objectType: 'GoFxRate', objectId: rate.id });
    return rate;
  }

  async latest(companyId: string, fromCurrency: string, toCurrency: string) {
    const rate = await this.prisma.goFxRate.findFirst({
      where: { companyId, fromCurrency, toCurrency },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!rate) throw new ForbiddenException('No FX rate found for pair');
    return rate;
  }

  async list(companyId: string, fromCurrency?: string, toCurrency?: string) {
    return this.prisma.goFxRate.findMany({
      where: {
        companyId,
        ...(fromCurrency ? { fromCurrency } : {}),
        ...(toCurrency ? { toCurrency } : {}),
      },
      orderBy: { effectiveAt: 'desc' },
    });
  }
}
