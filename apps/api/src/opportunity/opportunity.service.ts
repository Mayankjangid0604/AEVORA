import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunityStatus } from '@prisma/client';

@Injectable()
export class OpportunityService {
  constructor(private readonly prisma: PrismaService) {}

  async createOpportunity(companyId: string, clientId: string, data: { title: string; description?: string; inquiryId?: string; estimatedValue?: number }) {
    return this.prisma.opportunity.create({
      data: {
        companyId,
        clientId,
        ...data,
      },
    });
  }

  async getOpportunity(id: string) {
    return this.prisma.opportunity.findUnique({
      where: { id },
      include: { proposals: true, client: true, inquiry: true },
    });
  }

  async listOpportunities(companyId: string) {
    return this.prisma.opportunity.findMany({
      where: { companyId },
    });
  }

  async updateOpportunityStatus(id: string, status: OpportunityStatus) {
    return this.prisma.opportunity.update({
      where: { id },
      data: { status },
    });
  }

  async updateOpportunityAssessments(id: string, data: { estimatedCost?: number; estimatedProfit?: number; expectedDuration?: number; confidence?: number }) {
    return this.prisma.opportunity.update({
      where: { id },
      data,
    });
  }
}

