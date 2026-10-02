import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentRuntimeService } from '../agent/agent-runtime.service';

@Injectable()
export class ReceptionistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRuntime: AgentRuntimeService,
  ) {}

  async processInquiry(companyId: string, rawInquiry: string) {
    // 1. Find a Receptionist agent in the company (e.g., someone with Sales Executive role)
    const receptionist = await this.prisma.employee.findFirst({
      where: { companyId, agent: { isNot: null } },
      include: { agent: true }
    });

    if (!receptionist || !receptionist.agent) {
      throw new Error('No available Receptionist agent found in the company.');
    }

    // 2. Create the raw inquiry in the DB
    const inquiry = await this.prisma.clientInquiry.create({
      data: {
        companyId,
        title: 'New Incoming Inquiry',
        description: rawInquiry,
        status: 'NEW',
      },
    });

    // 3. Create a Task for the Receptionist
    await this.prisma.task.create({
      data: {
        companyId,
        assignedEmployeeId: receptionist.id,
        createdBy: 'SYSTEM_RECEPTION',
        title: `Process Client Inquiry: ${inquiry.id}`,
        description: `Please review the following inquiry and qualify it: ${rawInquiry}`,
        status: 'READY'
      }
    });

    // 4. Trigger the agent runtime for this agent
    return this.agentRuntime.runAgent(receptionist.agent.id);
  }
}

