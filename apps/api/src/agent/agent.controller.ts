import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkCycleService } from './work-cycle.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { EventStatus } from '@prisma/client';

@Controller('agents')
export class AgentController {
  constructor(
    private readonly runtimeService: AgentRuntimeService,
    private readonly workCycleService: WorkCycleService,
    private readonly schedulerService: AgentSchedulerService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list() {
    return this.prisma.agent.findMany();
  }

  @Post('schedule-work-cycles')
  async scheduleWorkCycles(@Body() body: { simulationTime: string }) {
    const agents = await this.schedulerService.getEligibleAgents();
    const time = new Date(body.simulationTime || new Date());
    
    let scheduled = 0;
    for (const agent of agents) {
      // Avoid double scheduling if already an event for this agent in SCHEDULED state
      const existing = await this.prisma.simulationEvent.findFirst({
        where: {
          type: 'EMPLOYEE_WORK_CYCLE',
          status: EventStatus.SCHEDULED,
          payload: { path: ['agentId'], equals: agent.id }
        }
      });

      if (!existing) {
        await this.prisma.simulationEvent.create({
          data: {
            type: 'EMPLOYEE_WORK_CYCLE',
            simulationTime: time,
            priority: 10,
            payload: { agentId: agent.id }
          }
        });
        scheduled++;
      }
    }
    return { scheduled };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.prisma.agent.findUnique({ where: { id }});
  }

  @Get(':id/executions')
  async executions(@Param('id') id: string) {
    return this.prisma.agentExecution.findMany({ 
      where: { agentId: id },
      orderBy: { startedAt: 'desc' }
    });
  }

  @Post(':id/run')
  async run(@Param('id') id: string) {
    return this.runtimeService.runAgent(id);
  }

  @Post(':id/work-cycle')
  async workCycle(@Param('id') id: string) {
    return this.workCycleService.runWorkCycle(id);
  }
}
