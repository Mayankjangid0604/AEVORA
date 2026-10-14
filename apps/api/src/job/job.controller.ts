import { BadRequestException, Controller, Get, Param, Post, Query, Body, UseGuards, Request } from '@nestjs/common';
import { JobService } from './job.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';
import { ExecutionEnvironment, JobStatus } from '@prisma/client';

/** Job types an operator may enqueue over HTTP (the worker fails anything else). */
const ENQUEUEABLE = new Set(['TASK_EXECUTION']);

@Controller('job')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CHAIRMAN', 'MANAGEMENT')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  /** Tenant comes from the token only; environment is always SIMULATION here (production jobs need an approval flow). */
  @Post()
  async enqueueJob(@Body() body: any, @Request() req) {
    if (!ENQUEUEABLE.has(body?.type)) throw new BadRequestException(`Unsupported job type ${body?.type}`);
    if (!req.user?.companyId) throw new BadRequestException('No company in token');
    const { companyId: _ignored, ...payload } = body.payload ?? {};
    return this.jobService.enqueue({
      type: body.type,
      payload: { ...payload, companyId: req.user.companyId },
      companyId: req.user.companyId,
      environment: ExecutionEnvironment.SIMULATION,
      priority: body.priority,
      idempotencyKey: body.idempotencyKey,
      correlationId: body.correlationId,
    });
  }

  /** Tenant jobs, newest first; FAILED rows carry attempts/maxAttempts/lastError (terminal-failure visibility). */
  @Get()
  list(@Request() req, @Query('status') status?: string) {
    if (status && !(status in JobStatus)) throw new BadRequestException(`Invalid status ${status}`);
    return this.jobService.listJobs(req.user.companyId, status as JobStatus | undefined);
  }

  @Get(':id')
  get(@Request() req, @Param('id') id: string) {
    return this.jobService.getJob(req.user.companyId, id);
  }

  /** pause | resume | replay — validated transitions, compare-and-set, audited. */
  @Post(':id/:action')
  control(@Request() req, @Param('id') id: string, @Param('action') action: string) {
    return this.jobService.controlJob(req.user.companyId, req.user.actorId, id, action);
  }
}
