import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { JobService } from './job.service';
import { JwtAuthGuard } from '../authorization/jwt-auth.guard';
import { ExecutionEnvironment } from '@prisma/client';

@Controller('job')
@UseGuards(JwtAuthGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  async enqueueJob(@Body() body: any, @Request() req) {
    return this.jobService.enqueue({
      type: body.type,
      payload: body.payload,
      companyId: req.user.companyId,
      environment: body.environment || ExecutionEnvironment.SIMULATION,
      priority: body.priority,
      idempotencyKey: body.idempotencyKey,
      correlationId: body.correlationId,
    });
  }
}
