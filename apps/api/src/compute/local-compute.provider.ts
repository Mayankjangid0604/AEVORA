import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ComputeWorkerService } from './compute-worker.service';
import * as os from 'os';
import { execSync } from 'child_process';

@Injectable()
export class LocalComputeProvider implements OnApplicationBootstrap {
  private readonly logger = new Logger(LocalComputeProvider.name);
  private workerId: string;
  private heartbeatTimer: NodeJS.Timeout;

  constructor(private readonly workerService: ComputeWorkerService) {}

  async onApplicationBootstrap() {
    this.logger.log('Initializing LocalComputeProvider and detecting capabilities...');
    
    const capabilities = this.detectCapabilities();
    
    const worker = await this.workerService.registerWorker({
      type: 'LOCAL_MACHINE',
      capabilities,
      capacity: {
        maxJobs: 1 // For local compute, limit to 1 job concurrently
      }
    });

    this.workerId = worker.id;
    this.logger.log(`Registered local compute worker with ID ${this.workerId}`);
    
    // Start heartbeat
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.workerService.heartbeat(this.workerId);
      } catch (e) {
        this.logger.error(`Failed to send worker heartbeat: ${e.message}`);
      }
    }, 10000).unref(); // .unref() so this doesn't block process exit
  }

  private detectCapabilities() {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
    const totalMem = os.totalmem();
    
    let gpuInfo = null;
    try {
      // Try to detect NVIDIA GPU
      const result = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { encoding: 'utf-8' });
      if (result.trim()) {
        const parts = result.trim().split(',');
        gpuInfo = {
          name: parts[0].trim(),
          vram: parts.length > 1 ? parts[1].trim() : 'Unknown'
        };
      }
    } catch (e) {
      // No nvidia-smi
    }

    return {
      os: os.platform(),
      arch: os.arch(),
      cpu: cpuModel,
      cores: cpus.length,
      memoryBytes: totalMem,
      gpu: gpuInfo || 'None'
    };
  }

  getWorkerId(): string {
    return this.workerId;
  }
}
