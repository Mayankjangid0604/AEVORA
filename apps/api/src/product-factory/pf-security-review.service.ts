import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfSecuritySeverity, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfSecurityReviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async create(companyId: string, actorId: string, productId: string, dto: {
    versionRef?: string;
    findings?: Array<{ title: string; severity: string; status: string }>;
    overallSeverity?: PfSecuritySeverity;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    const sr = await this.prisma.pfSecurityReview.create({
      data: {
        companyId, productId,
        versionRef: dto.versionRef,
        findings: (dto.findings ?? []) as any,
        overallSeverity: dto.overallSeverity ?? PfSecuritySeverity.INFO,
        status: 'OPEN',
        reviewedBy: actorId,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_SECURITY_REVIEW_CREATED', objectType: 'PfSecurityReview', objectId: sr.id });
    return sr;
  }

  async list(companyId: string, productId: string) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfSecurityReview.findMany({ where: { companyId, productId }, orderBy: { createdAt: 'desc' } });
  }

  async clear(companyId: string, actorId: string, reviewId: string) {
    await this.verifyActor(actorId, companyId);
    const sr = await this.prisma.pfSecurityReview.findUnique({ where: { id: reviewId } });
    if (!sr || sr.companyId !== companyId) throw new NotFoundException('Security review not found');
    // Cannot self-clear own review
    if (sr.reviewedBy === actorId) throw new ForbiddenException('Reviewer cannot self-clear security review');
    // Critical/High findings block clearance unless explicitly remediated
    const findings = (sr.findings as Array<{ severity: string; status: string }>) ?? [];
    const unremediated = findings.filter(f =>
      ['CRITICAL', 'HIGH'].includes(f.severity.toUpperCase()) && f.status.toUpperCase() !== 'RESOLVED',
    );
    if (unremediated.length > 0)
      throw new BadRequestException(`Cannot clear: ${unremediated.length} unresolved CRITICAL/HIGH finding(s)`);

    const updated = await this.prisma.pfSecurityReview.update({
      where: { id: reviewId },
      data: { status: 'CLEARED', clearedBy: actorId, clearedAt: new Date() },
    });
    await this.audit.record({ companyId, actorId, productId: sr.productId, action: 'PF_SECURITY_REVIEW_CLEARED', objectType: 'PfSecurityReview', objectId: reviewId });
    return updated;
  }

  async addFinding(companyId: string, actorId: string, reviewId: string, finding: { title: string; severity: string; status: string }) {
    await this.verifyActor(actorId, companyId);
    const sr = await this.prisma.pfSecurityReview.findUnique({ where: { id: reviewId } });
    if (!sr || sr.companyId !== companyId) throw new NotFoundException('Security review not found');
    const findings = [...((sr.findings as any[]) ?? []), finding];
    const sevOrder = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const maxSev = findings.reduce((max, f) => {
      const idx = sevOrder.indexOf(f.severity.toUpperCase());
      const maxIdx = sevOrder.indexOf(max);
      return idx > maxIdx ? f.severity.toUpperCase() : max;
    }, 'INFO');
    const updated = await this.prisma.pfSecurityReview.update({
      where: { id: reviewId },
      data: { findings: findings as any, overallSeverity: maxSev as PfSecuritySeverity },
    });
    await this.audit.record({ companyId, actorId, productId: sr.productId, action: 'PF_SECURITY_FINDING_ADDED', objectType: 'PfSecurityReview', objectId: reviewId, newValue: finding });
    return updated;
  }
}
