import { Injectable, Logger } from '@nestjs/common';

export type WorkerHandler = (taskId: string) => Promise<boolean>;

@Injectable()
export class WorkerRegistryService {
  private readonly logger = new Logger(WorkerRegistryService.name);
  private workers: Map<string, WorkerHandler> = new Map();

  registerWorker(capability: string, handler: WorkerHandler) {
    this.logger.log(`[WorkerRegistry] Registered worker for capability: ${capability}`);
    this.workers.set(capability, handler);
  }

  getWorker(capability: string): WorkerHandler | undefined {
    return this.workers.get(capability);
  }

  getRegisteredCapabilities(): string[] {
    return Array.from(this.workers.keys());
  }
}
