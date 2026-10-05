import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentContextBuilder } from './agent-context.service';
import { AgentPolicyService } from './agent-policy.service';
import { ModelGateway } from '@aevora/model-gateway';
import { AgentStatus, ExecutionStatus } from '@prisma/client';

@Injectable()
export class AgentRuntimeService {
  private modelGateway = new ModelGateway();

  constructor(
    private prisma: PrismaService,
    private contextBuilder: AgentContextBuilder,
    private policyService: AgentPolicyService
  ) {}

  async runAgent(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { employee: true }
    });

    if (!agent) throw new BadRequestException('Agent not found');
    if (agent.status !== AgentStatus.ACTIVE) throw new BadRequestException('Agent is not active');

    // 1. Create Execution Record
    const execution = await this.prisma.agentExecution.create({
      data: {
        agentId,
        companyId: agent.employee.companyId,
        employeeId: agent.employeeId,
        provider: 'local',
        model: 'local-stub',
        status: ExecutionStatus.RUNNING,
      }
    });

    try {
      // 2. Build Context
      const context = await this.contextBuilder.buildContext(agentId);

      // 3. System Prompt
      const prompt = `
SYSTEM INSTRUCTIONS:
${context.systemInstructions}

CURRENT CONTEXT:
${JSON.stringify(context, null, 2)}

You must respond with a JSON structured output representing your actions.
`;

      // 4. Call Model Gateway
      const response = await this.modelGateway.generate({
        prompt: prompt,
        requireStructuredOutput: true,
      });

      const structured = response.structuredOutput;
      
      if (!structured || !Array.isArray(structured.actions)) {
        throw new Error('Model did not return valid actions array');
      }

      const proposed = structured.actions;
      const accepted: any[] = [];
      const rejected: any[] = [];

      // 5. Policy & Validation
      for (const action of proposed) {
        if (!action.type) {
           rejected.push({ action, reason: 'Missing action type' });
           continue;
        }

        const policyResult = await this.policyService.evaluateAction(
          agent.employeeId,
          agent.employee.companyId,
          action.type,
          action.parameters || {}
        );

        if (policyResult.decision === 'ALLOW') {
          accepted.push(action);
        } else {
          rejected.push({ action, reason: policyResult.reason });
        }
      }

      // 6. Execute Allowed Actions (Mock execution for Phase 3)
      // In future phases, this will map to actual Domain Service calls.
      
      // 7. Record Result
      const completed = await this.prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.COMPLETED,
          completedAt: new Date(),
          proposedActions: proposed,
          acceptedActions: accepted,
          rejectedActions: rejected,
        }
      });

      return completed;

    } catch (error: any) {
      const failed = await this.prisma.agentExecution.update({
        where: { id: execution.id },
        data: {
          status: ExecutionStatus.FAILED,
          completedAt: new Date(),
          error: error.message,
        }
      });
      return failed;
    }
  }
}
