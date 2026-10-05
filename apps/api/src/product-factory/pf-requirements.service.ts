import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfRequirementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, productId: string, dto: {
    title: string;
    description: string;
    reqType?: string;
    priority?: string;
    versionRef?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    const req = await this.prisma.pfProductRequirement.create({
      data: {
        companyId, productId,
        title: dto.title, description: dto.description,
        reqType: dto.reqType ?? 'FUNCTIONAL',
        priority: dto.priority ?? 'MEDIUM',
        versionRef: dto.versionRef,
        createdBy: actorId, isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_REQUIREMENT_CREATED', objectType: 'PfProductRequirement', objectId: req.id });
    return req;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfProductRequirement.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }

  async update(companyId: string, actorId: string, reqId: string, dto: { title?: string; description?: string; priority?: string; status?: string }) {
    await this.verifyActor(actorId, companyId);
    const req = await this.prisma.pfProductRequirement.findUnique({ where: { id: reqId } });
    if (!req || req.companyId !== companyId) throw new NotFoundException('Requirement not found');
    if (req.isLocked) throw new BadRequestException('Requirement is locked (released version)');

    const safeData: Record<string, any> = {};
    if (dto.title !== undefined) safeData.title = dto.title;
    if (dto.description !== undefined) safeData.description = dto.description;
    if (dto.priority !== undefined) safeData.priority = dto.priority;
    if (dto.status !== undefined) safeData.status = dto.status;
    // ponytail: explicit whitelist; companyId/productId/createdBy/isAdvisory/isLocked never allowed via update
    const updated = await this.prisma.pfProductRequirement.update({ where: { id: reqId }, data: safeData });
    await this.audit.record({ companyId, actorId, productId: req.productId, action: 'PF_REQUIREMENT_UPDATED', objectType: 'PfProductRequirement', objectId: reqId, newValue: safeData });
    return updated;
  }
}
