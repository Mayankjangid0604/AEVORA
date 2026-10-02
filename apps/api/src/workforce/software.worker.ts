import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WorkerRegistryService } from './worker-registry.service';
import { SoftwareExecutionService } from '../project-execution/software-execution.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SoftwareWorker implements OnModuleInit {
  private readonly logger = new Logger(SoftwareWorker.name);

  constructor(
    private readonly workerRegistry: WorkerRegistryService,
    private readonly softwareExecutionService: SoftwareExecutionService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.workerRegistry.registerWorker('SOFTWARE_DEVELOPMENT', async (taskId: string) => {
      this.logger.log(`[SOFTWARE WORKER] Executing task ${taskId}...`);
      
      const task = await this.prisma.task.findUnique({
        where: { id: taskId }
      });
      if (!task || !task.projectId) {
        throw new Error('Task must have a projectId for SoftwareExecution');
      }

      const employee = await this.prisma.employee.findFirst({
        where: { role: { title: 'ENGINEER' } }
      }) || await this.prisma.employee.findFirst();

      if (!employee) {
        throw new Error('No employee available for software execution');
      }

      // We execute development
      const executionId = await this.softwareExecutionService.executeDevelopment(
        task.projectId,
        employee.id,
        taskId
      );

      this.logger.log(`[SOFTWARE WORKER] Executed development: ${executionId}`);

      // We can also trigger build/test if we want, but development is the core requirement.
      // Let's do build and test if the execution succeeded.
      const buildId = await this.softwareExecutionService.executeBuild(task.projectId);
      this.logger.log(`[SOFTWARE WORKER] Executed build: ${buildId}`);

      const testId = await this.softwareExecutionService.executeTest(task.projectId, buildId as string);
      this.logger.log(`[SOFTWARE WORKER] Executed test: ${testId}`);

      return true; // Success
    });
  }
}
