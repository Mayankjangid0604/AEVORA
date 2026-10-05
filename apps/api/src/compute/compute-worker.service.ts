import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ComputeWorkerService {
  private readonly logger = new Logger(ComputeWorkerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerWorker(data: { type: string; capabilities: any; capacity?: any; companyId?: string }) {
    this.logger.log(`Registering compute worker of type ${data.type}`);
    return this.prisma.computeWorker.create({
      data: {
        type: data.type,
        capabilities: data.capabilities,
        capacity: data.capacity || {},
        companyId: data.companyId,
        status: 'IDLE',
        health: 'HEALTHY',
        lastHeartbeat: new Date(),
      }
    });
  }

  async heartbeat(workerId: string, status?: string) {
    await this.prisma.computeWorker.update({
      where: { id: workerId },
      data: {
        lastHeartbeat: new Date(),
        ...(status ? { status } : {})
      }
    });
  }

  async getWorkers() {
    return this.prisma.computeWorker.findMany();
  }

  async getWorker(id: string) {
    const worker = await this.prisma.computeWorker.findUnique({ where: { id } });
    if (!worker) throw new NotFoundException('Worker not found');
    return worker;
  }

  async drain(id: string) {
    await this.prisma.computeWorker.update({
      where: { id },
      data: { status: 'DRAINING' }
    });
  }

  async markLostWorkers() {
    // A worker is lost if we haven't heard from it in 30 seconds
    const threshold = new Date(Date.now() - 30 * 1000);
    const lostWorkers = await this.prisma.computeWorker.findMany({
      where: {
        lastHeartbeat: { lt: threshold },
        status: { notIn: ['OFFLINE', 'WORKER_LOST'] }
      }
    });

    for (const worker of lostWorkers) {
      this.logger.warn(`Worker ${worker.id} marked as LOST due to stale heartbeat`);
      await this.prisma.computeWorker.update({
        where: { id: worker.id },
        data: { status: 'WORKER_LOST', health: 'UNHEALTHY' }
      });
      // Further logic to transition jobs will be handled by the JobService/Scheduler
    }
  }
}
