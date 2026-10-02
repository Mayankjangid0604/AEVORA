import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RiskDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async recordRiskObservation(sessionId: string, data: { category: any; description: string; severity?: string; likelihood?: string; evidence?: string; mitigation?: string }) {
    return this.prisma.riskObservation.create({
      data: {
        sessionId,
        category: data.category,
        description: data.description,
        severity: data.severity || 'MEDIUM',
        likelihood: data.likelihood || 'MEDIUM',
        evidence: data.evidence,
        mitigation: data.mitigation,
        status: 'IDENTIFIED',
      },
    });
  }
}
