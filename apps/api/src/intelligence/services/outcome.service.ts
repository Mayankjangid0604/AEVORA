import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OutcomeService {
  constructor(private readonly prisma: PrismaService) {}

  async recordOutcome(sessionId: string, data: { result: string; actualOutcome: string; expectedOutcome: string; success: boolean; lessons?: string }) {
    let session = await this.prisma.intelligenceSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      // Find the objective or any company info if possible, otherwise default to a system employee or dummy
      const objective = await this.prisma.aeEnterpriseObjective.findUnique({ where: { id: sessionId } });
      if (objective) {
        // We need an employee to create the session. We'll pick any active employee for this company.
        const employee = await this.prisma.employee.findFirst({ where: { companyId: objective.companyId } });
        if (employee) {
          session = await this.prisma.intelligenceSession.create({
            data: {
              id: sessionId,
              companyId: objective.companyId,
              employeeId: employee.id,
              objective: objective.title || 'Enterprise Objective Execution',
              status: 'COMPLETED'
            }
          });
        }
      }
    }

    if (!session) {
       // Cannot create outcome without a valid session.
       return null;
    }

    return this.prisma.intelligenceOutcome.create({
      data: {
        sessionId,
        result: data.result,
        actualOutcome: data.actualOutcome,
        expectedOutcome: data.expectedOutcome,
        success: data.success,
        lessons: data.lessons,
      },
    });
  }
}
