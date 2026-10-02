import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeeStatus, StrategicThemeStatus } from '@prisma/client';

@Injectable()
export class StrategicThemeService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor is not active');
    return actor;
  }

  async createTheme(companyId: string, actorId: string, dto: { name: string; description?: string }) {
    await this.verifyActor(actorId, companyId);
    return this.prisma.strategicTheme.create({ data: { companyId, name: dto.name, description: dto.description, createdBy: actorId } });
  }

  async archiveTheme(companyId: string, actorId: string, themeId: string) {
    await this.verifyActor(actorId, companyId);
    const theme = await this.prisma.strategicTheme.findUnique({ where: { id: themeId } });
    if (!theme || theme.companyId !== companyId) throw new NotFoundException('Theme not found');
    return this.prisma.strategicTheme.update({ where: { id: themeId }, data: { status: StrategicThemeStatus.ARCHIVED } });
  }

  async getThemes(companyId: string, status?: StrategicThemeStatus) {
    return this.prisma.strategicTheme.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
