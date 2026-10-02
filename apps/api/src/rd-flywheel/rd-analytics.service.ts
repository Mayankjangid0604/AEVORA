import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RdInitiativeStatus } from '@prisma/client';

@Injectable()
export class RdAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async flyWheelSummary(companyId: string) {
    const [totalPortfolios, activeInitiatives, completedInitiatives, totalCapabilities, totalFeedback] = await Promise.all([
      this.prisma.rdPortfolio.count({ where: { companyId } }),
      this.prisma.rdInitiative.count({ where: { companyId, status: RdInitiativeStatus.IN_PROGRESS } }),
      this.prisma.rdInitiative.count({ where: { companyId, status: RdInitiativeStatus.COMPLETED } }),
      this.prisma.rdCapability.count({ where: { companyId } }),
      this.prisma.rdFeedbackItem.count({ where: { companyId } }),
    ]);
    return {
      isAdvisory: true,
      companyId,
      totalPortfolios,
      activeInitiatives,
      completedInitiatives,
      totalCapabilities,
      totalFeedback,
    };
  }
}
