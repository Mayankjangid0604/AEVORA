import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PfAuditService } from './pf-audit.service';
import { PfFeedbackSource, EmployeeStatus } from '@prisma/client';

@Injectable()
export class PfFeedbackService {
  constructor(private readonly prisma: PrismaService, private readonly audit: PfAuditService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const a = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!a || a.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (a.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  async record(companyId: string, actorId: string, productId: string, dto: {
    source: PfFeedbackSource;
    content: string;
    sentiment?: string;
    featureRef?: string;
    customerId?: string;
    versionRef?: string;
    isAiSynthesized?: boolean;
  }) {
    await this.verifyActor(actorId, companyId);
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');

    // Verify customer is in the same company if provided
    if (dto.customerId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.customerId } });
      if (!client || client.companyId !== companyId) throw new ForbiddenException('Customer not in company');
    }

    const fb = await this.prisma.pfCustomerFeedback.create({
      data: {
        companyId, productId,
        source: dto.source,
        content: dto.content,
        sentiment: dto.sentiment,
        featureRef: dto.featureRef,
        customerId: dto.customerId,
        versionRef: dto.versionRef,
        recordedBy: actorId,
        isAiSynthesized: dto.isAiSynthesized ?? false,
        isAdvisory: true,
      },
    });
    await this.audit.record({ companyId, actorId, productId, action: 'PF_FEEDBACK_RECORDED', objectType: 'PfCustomerFeedback', objectId: fb.id });
    return fb;
  }

  async list(companyId: string, productId: string, source?: PfFeedbackSource) {
    const p = await this.prisma.pfProduct.findUnique({ where: { id: productId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Product not found');
    return this.prisma.pfCustomerFeedback.findMany({
      where: { companyId, productId, ...(source ? { source } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
