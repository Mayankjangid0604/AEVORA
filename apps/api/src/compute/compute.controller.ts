import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ComputeWorkerService } from './compute-worker.service';
import { TrainingJobService } from './training-job.service';

@Controller('compute')
export class ComputeController {
  constructor(
    private readonly workerService: ComputeWorkerService,
    private readonly jobService: TrainingJobService
  ) {}

  @Post('workers/register')
  async registerWorker(@Body() data: any) {
    return this.workerService.registerWorker(data);
  }

  @Get('workers')
  async getWorkers() {
    return this.workerService.getWorkers();
  }

  @Get('workers/:id')
  async getWorker(@Param('id') id: string) {
    return this.workerService.getWorker(id);
  }

  @Post('workers/:id/heartbeat')
  async workerHeartbeat(@Param('id') id: string, @Body() data: any) {
    return this.workerService.heartbeat(id, data.status);
  }

  @Post('workers/:id/drain')
  async drainWorker(@Param('id') id: string) {
    return this.workerService.drain(id);
  }

  @Get('jobs')
  async getJobs() {
    return this.jobService.getJobs();
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    return this.jobService.getJob(id);
  }

  @Post('jobs/:id/cancel')
  async cancelJob(@Param('id') id: string) {
    return this.jobService.cancelJob(id);
  }

  @Get('jobs/:id/logs')
  async getJobLogs(@Param('id') id: string) {
    return this.jobService.getLogs(id);
  }
}
