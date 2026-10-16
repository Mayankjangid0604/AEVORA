import { Injectable, Logger } from '@nestjs/common';
import type { BackgroundJob } from '@prisma/client';

export type JobHandler = (job: BackgroundJob) => Promise<void>;

/**
 * Lets feature modules register a handler for their own BackgroundJob type without JobModule importing them
 * (which would create a module cycle). The worker consults it for any type other than TASK_EXECUTION.
 * A handler must be idempotent: the worker may run the same job again after a failure or a lost lease.
 */
@Injectable()
export class JobHandlerRegistry {
  private readonly logger = new Logger(JobHandlerRegistry.name);
  private readonly handlers = new Map<string, JobHandler>();

  register(type: string, handler: JobHandler) {
    this.handlers.set(type, handler);
    this.logger.log(`Registered job handler for ${type}`);
  }

  get(type: string): JobHandler | undefined {
    return this.handlers.get(type);
  }
}
