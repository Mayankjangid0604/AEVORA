import { Controller, Post, Get, Param, Body, Request, UseGuards } from '@nestjs/common';
import { ComputeWorkerService } from './compute-worker.service';
import { TrainingJobService } from './training-job.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../authorization/roles.guard';
import { Roles } from '../authorization/roles.decorator';

/**
 * V14 slice 6: workers and training jobs were readable and mutable across companies by raw id, and lists
 * returned every company's rows. Everything is now bound to the caller's company (shared workers with no
 * company are not visible through this API); mutations require CHAIRMAN or SYSTEM.
 */
@UseGuards(RolesGuard)
@Controller('compute')
export class ComputeController {
  constructor(
    private readonly workerService: ComputeWorkerService,
    private readonly jobService: TrainingJobService,
    private readonly authz: AuthorizationService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles('CHAIRMAN', 'SYSTEM')
  @Post('workers/register')
  async registerWorker(@Body() data: any, @Request() req) {
    await this.authz.assertCompanyAccess(req.user, req.user.companyId);
    return this.workerService.registerWorker({ ...data, companyId: req.user.companyId }); // never a body companyId
  }

  @Get('workers')
  async getWorkers(@Request() req) {
    const companyId = req.user.companyId;
    return (await this.workerService.getWorkers()).filter((w) => !!companyId && w.companyId === companyId);
  }

  @Get('workers/:id')
  async getWorker(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'computeWorker', id);
    return this.workerService.getWorker(id);
  }

  @Roles('CHAIRMAN', 'SYSTEM')
  @Post('workers/:id/heartbeat')
  async workerHeartbeat(@Param('id') id: string, @Body() data: any, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'computeWorker', id);
    return this.workerService.heartbeat(id, data.status);
  }

  @Roles('CHAIRMAN', 'SYSTEM')
  @Post('workers/:id/drain')
  async drainWorker(@Param('id') id: string, @Request() req) {
    await this.authz.assertResourceAccess(req.user, 'computeWorker', id);
    return this.workerService.drain(id);
  }

  @Get('jobs')
  async getJobs(@Request() req) {
    const companyId = req.user.companyId;
    if (!companyId) return [];
    const runs = new Set((await this.prisma.trainingRun.findMany({ where: { companyId }, select: { id: true } })).map((r) => r.id));
    return (await this.jobService.getJobs()).filter((j) => runs.has(j.trainingRunId));
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string, @Request() req) {
    await this.authz.assertTrainingJobAccess(req.user, id);
    return this.jobService.getJob(id);
  }

  @Roles('CHAIRMAN', 'SYSTEM')
  @Post('jobs/:id/cancel')
  async cancelJob(@Param('id') id: string, @Request() req) {
    await this.authz.assertTrainingJobAccess(req.user, id);
    return this.jobService.cancelJob(id);
  }

  @Get('jobs/:id/logs')
  async getJobLogs(@Param('id') id: string, @Request() req) {
    await this.authz.assertTrainingJobAccess(req.user, id);
    return this.jobService.getLogs(id);
  }
}
