import {
  Injectable, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoAuditService } from './go-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class GoCountryService {
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

  async create(companyId: string, actorId: string, regionId: string, dto: {
    name: string; isoCode: string; currency: string; timeZone?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    try {
      const country = await this.prisma.goCountry.create({
        data: {
          companyId, regionId, name: dto.name, isoCode: dto.isoCode,
          currency: dto.currency, timeZone: dto.timeZone,
          isAdvisory: false,
          createdBy: actorId,
        },
      });
      await this.audit.record({ companyId, actorId, regionId, action: 'GO_COUNTRY_CREATED', objectType: 'GoCountry', objectId: country.id, newValue: { isoCode: dto.isoCode } });
      return country;
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Country with this isoCode already exists in region');
      throw e;
    }
  }

  async list(companyId: string, regionId: string) {
    const region = await this.prisma.goRegion.findUnique({ where: { id: regionId } });
    if (!region || region.companyId !== companyId) throw new ForbiddenException('Region not in company');
    return this.prisma.goCountry.findMany({
      where: { companyId, regionId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
