import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AutonomyLevel, AgentStatus, EmployeeAvailability } from '@prisma/client';

@Injectable()
export class AgentSchedulerService {
  private readonly logger = new Logger(AgentSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  async getEligibleAgents() {
    // AGENT_WORK_CYCLES=false pauses per-agent LLM work cycles (the heaviest model load); the business loop
    // (sales, delivery, CEO review, hiring, inbox) keeps running without them.
    if (process.env.AGENT_WORK_CYCLES === 'false') return [];
    // Determine which agents should receive a work cycle
    // Employee ACTIVE, Agent ACTIVE, not ON_HOLD/SUSPENDED/OFFLINE
    // Has READY or IN_PROGRESS tasks OR has a Management role.
    // Autonomy Level ASSISTED, CONTROLLED, AUTONOMOUS, or HIGH_AUTONOMY

    const allAgents = await this.prisma.agent.findMany({
      where: {
        status: AgentStatus.ACTIVE,
        autonomyLevel: {
          in: [AutonomyLevel.ASSISTED, AutonomyLevel.CONTROLLED, AutonomyLevel.AUTONOMOUS, AutonomyLevel.HIGH_AUTONOMY]
        },
        employee: {
          status: 'ACTIVE',
          availability: EmployeeAvailability.AVAILABLE,
        }
      },
      include: {
        employee: {
          include: { role: true, assignedTasks: true }
        }
      }
    });

    const eligibleAgents = allAgents.filter(agent => {
      const emp = agent.employee;
      const managementRoles = ['Chief Executive Officer', 'CEO', 'HR Manager', 'Engineering Manager', 'Operations Manager', 'Sales Manager', 'Project Manager'];
      const isManager = managementRoles.includes(emp.role.title);
      const hasActiveTasks = emp.assignedTasks.some((t: any) => ['READY', 'IN_PROGRESS'].includes(t.status));
      return isManager || hasActiveTasks;
    });

    const scheduledAgents = [];

    for (const agent of eligibleAgents) {
      if (this.checkAgentBudget(agent)) {
        scheduledAgents.push(agent);
      } else {
        this.logger.warn(`Agent ${agent.id} exceeded execution budget and is throttled.`);
      }
    }

    return scheduledAgents;
  }

  private checkAgentBudget(agent: any): boolean {
    const budget = agent.budget || {};
    // For now, if there's no limit defined, we allow it.
    // Future: implement max executions per hour, check executions in last hour using DB.
    // For Phase 5, returning true for eligible agents.
    if (budget.disabled) return false;
    return true;
  }
}
