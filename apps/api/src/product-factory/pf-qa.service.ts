import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfQAStatus, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfQAService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async record(companyId: string, actorId: string, productId: string, dto: {
    versionRef?: string;
    unitTestStatus?: PfQAStatus;
    integrationStatus?: PfQAStatus;
    acceptanceStatus?: PfQAStatus;
    regressionStatus?: PfQAStatus;
    performanceStatus?: PfQAStatus;
    securityStatus?: PfQAStatus;
    evidenceNotes?: string;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    const allStatuses = [
      dto.unitTestStatus, dto.integrationStatus, dto.acceptanceStatus,
      dto.regressionStatus, dto.performanceStatus, dto.securityStatus,
    ].filter((s): s is PfQAStatus => s !== undefined);
    // Vacuously true when no statuses provided; false if any non-PASSED status present
    const overallReady = allStatuses.every(s => s === PfQAStatus.PASSED);

    const qa = await this.prisma.pfQARecord.create({
      data: {
        companyId, productId, versionRef: dto.versionRef,
        unitTestStatus: dto.unitTestStatus ?? PfQAStatus.NOT_STARTED,
        integrationStatus: dto.integrationStatus ?? PfQAStatus.NOT_STARTED,
        acceptanceStatus: dto.acceptanceStatus ?? PfQAStatus.NOT_STARTED,
        regressionStatus: dto.regressionStatus ?? PfQAStatus.NOT_STARTED,
        performanceStatus: dto.performanceStatus ?? PfQAStatus.NOT_STARTED,
        securityStatus: dto.securityStatus ?? PfQAStatus.NOT_STARTED,
        overallReady,
        evidenceNotes: dto.evidenceNotes,
        recordedBy: actorId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_QA_RECORDED', objectType: 'PfQARecord', objectId: qa.id, newValue: { overallReady } });
    return qa;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfQARecord.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }
}
