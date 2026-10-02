import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  async createPlan(sessionId: string, objective: string, steps?: { title: string; description: string; expectedOutcome?: string }[]) {
    const plan = await this.prisma.intelligencePlan.create({
      data: {
        sessionId,
        objective,
        status: 'PENDING',
      },
    });

    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        await this.prisma.intelligencePlanStep.create({
          data: {
            planId: plan.id,
            sequence: i,
            title: steps[i].title,
            description: steps[i].description,
            status: 'PENDING',
          },
        });
      }
    }

    return plan;
  }

  async updateStepStatus(stepId: string, status: string) {
    return this.prisma.intelligencePlanStep.update({
      where: { id: stepId },
      data: { status },
    });
  }
}
