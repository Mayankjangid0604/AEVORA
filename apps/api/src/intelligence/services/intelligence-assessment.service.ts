import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IntelligenceAssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async createAssessment(sessionId: string, data: { summary: string; recommendation: string; risks?: any[]; uncertainties?: any[]; assumptions?: any[]; options?: any[]; evidence?: any[] }) {
    const assessment = await this.prisma.intelligenceAssessment.create({
      data: {
        sessionId,
        summary: data.summary,
        recommendation: data.recommendation,
        risks: data.risks || [],
        uncertainties: data.uncertainties || [],
        assumptions: data.assumptions || [],
        options: data.options || [],
      },
    });

    if (data.evidence && data.evidence.length > 0) {
      for (const ev of data.evidence) {
        await this.prisma.intelligenceEvidence.create({
          data: {
            assessmentId: assessment.id,
            sourceType: ev.sourceType,
            sourceId: ev.sourceId,
            summary: ev.summary,
          },
        });
      }
    }

    return assessment;
  }
}
