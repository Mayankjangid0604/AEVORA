import { Controller, Get, Post, Param, Body, Request, UseGuards } from '@nestjs/common';
import { AgentRuntimeService } from './agent-runtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkCycleService } from './work-cycle.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { EventStatus } from '@prisma/client';
import { AuthorizationService } from '../authorization/authorization.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

/**
 * V14 slice 6: every route was unscoped (any authenticated user could list all agents, read any agent's
 * executions, and trigger AI agent runs/work cycles for any company). Reads are now bound to the caller's
 * company; triggers that run agents are Chairman-only and limited to the caller's company.
 */
@UseGuards(RolesGuard)
@Controller('agents')
export class AgentController {
  constructor(
    private readonly runtimeService: AgentRuntimeService,
    private readonly workCycleService: WorkCycleService,
    private readonly schedulerService: AgentSchedulerService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  async list(@Request() req) {
    return this.prisma.agent.findMany({ where: { employee: { companyId: req.user.companyId ?? '__none__' } } });
  }

  /** Schedules work cycles only for the caller's company's eligible agents (previously: every company's). */
  @Roles('CHAIRMAN')
  @Post('schedule-work-cycles')
  async scheduleWorkCycles(@Body() body: { simulationTime: string }, @Request() req) {
    const companyId = req.user.companyId;
    await this.authz.assertCompanyAccess(req.user, companyId);
    const inCompany = new Set(
      (await this.prisma.agent.findMany({ where: { employee: { companyId } }, select: { id: true } })).map((a) => a.id),
    );
    const agents = (await this.schedulerService.getEligibleAgents()).filter((a) => inCompany.has(a.id));
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
  async get(@Param('id') id: string, @Request() req) {
    await this.authz.assertAgentAccess(req.user, id);
    return this.prisma.agent.findUnique({ where: { id } });
  }

  @Get(':id/executions')
  async executions(@Param('id') id: string, @Request() req) {
    await this.authz.assertAgentAccess(req.user, id);
    return this.prisma.agentExecution.findMany({
      where: { agentId: id },
      orderBy: { startedAt: 'desc' }
    });
  }

  @Roles('CHAIRMAN')
  @Post(':id/run')
  async run(@Param('id') id: string, @Request() req) {
    await this.authz.assertAgentAccess(req.user, id);
    return this.runtimeService.runAgent(id);
  }

  @Roles('CHAIRMAN')
  @Post(':id/work-cycle')
  async workCycle(@Param('id') id: string, @Request() req) {
    await this.authz.assertAgentAccess(req.user, id);
    return this.workCycleService.runWorkCycle(id);
  }
}
