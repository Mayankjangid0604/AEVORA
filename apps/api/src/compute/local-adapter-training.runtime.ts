import { Injectable, Logger } from '@nestjs/common';
import { TrainingRuntime } from './training-runtime.interface';
import { LocalComputeProvider } from './local-compute.provider';
import { TrainingJobService } from './training-job.service';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LocalAdapterTrainingRuntime implements TrainingRuntime {
  private readonly logger = new Logger(LocalAdapterTrainingRuntime.name);
  private activeJobs = new Map<string, ChildProcess>();

  constructor(
    private readonly localComputeProvider: LocalComputeProvider,
    private readonly jobService: TrainingJobService
  ) {}

  getIdentifier(): string {
    return 'LOCAL_ADAPTER_RUNTIME';
  }

  isAvailable(): boolean {
    return true; // Always available on local compute
  }

  async detectCapabilities(): Promise<any> {
    return { support: 'small_adapter_tuning', framework: 'mock-local' };
  }

  async execute(jobId: string, _configuration: any, _datasetPaths: string[], _baseModelPath?: string): Promise<void> {
    this.logger.log(`Starting execution for job ${jobId}`);
    
    // Create a real subprocess that simulates heavy work and saves actual files.
    // In a real environment, this would spawn python/torch.
    // We will spawn a Node script that faithfully acts like a training job.
    
    const workerId = this.localComputeProvider.getWorkerId();
    await this.jobService.updateJobStatus(jobId, 'RUNNING');
    
    // We create a temporary script for execution to ensure isolation boundary testing
    const scriptDir = path.join(process.cwd(), '.temp', 'training');
    if (!fs.existsSync(scriptDir)) {
      fs.mkdirSync(scriptDir, { recursive: true });
    }
    
    const scriptPath = path.join(scriptDir, `train-${jobId}.js`);
    const artifactPath = path.join(scriptDir, `artifact-${jobId}.bin`);
    
    const scriptContent = `
      const fs = require('fs');
      
      console.log('STARTING_TRAINING');
      let step = 0;
      const totalSteps = 5;
      
      const interval = setInterval(() => {
        step++;
        console.log(\`METRIC_LOG|loss|\${1.0 - (step * 0.1)}|\${step}\`);
        console.log(\`HEARTBEAT|\${step / totalSteps}|\${step}\`);
        
        if (step >= totalSteps) {
          clearInterval(interval);
          fs.writeFileSync('${artifactPath.replace(/\\/g, '\\\\')}', 'FAKE_MODEL_WEIGHTS');
          console.log(\`ARTIFACT_CREATED|${artifactPath.replace(/\\/g, '\\\\')}\`);
          console.log('TRAINING_COMPLETED');
          process.exit(0);
        }
      }, 1000); // 1 sec per step for fast testing
    `;
    
    fs.writeFileSync(scriptPath, scriptContent);
    
    const child = spawn('node', [scriptPath], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.activeJobs.set(jobId, child);
    
    // Track execution stats
    
    child.stdout.on('data', async (data) => {
      const lines = data.toString().split('\\n').filter(l => l.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('HEARTBEAT|')) {
          const parts = line.split('|');
          await this.jobService.recordHeartbeat(jobId, workerId, parseFloat(parts[1]), parseInt(parts[2]), { mem: '100MB' });
        } else if (line.startsWith('METRIC_LOG|')) {
          await this.jobService.log(jobId, `Metric: ${line}`);
        } else if (line.startsWith('ARTIFACT_CREATED|')) {
          // Store the artifact location
          await this.jobService.log(jobId, `Artifact created at: ${line.split('|')[1]}`);
        } else {
          await this.jobService.log(jobId, line);
        }
      }
    });

    child.stderr.on('data', async (data) => {
      await this.jobService.log(jobId, data.toString(), 'ERROR');
    });

    child.on('close', async (code) => {
      this.activeJobs.delete(jobId);
      
      // Cleanup script
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

      if (code === 0) {
        // Record final usage
        // Note: Prisma schema ResourceUsageRecord needs actual DB persistence here
        // We will just update job status to COMPLETED for now.
        await this.jobService.updateJobStatus(jobId, 'COMPLETED');
      } else {
        await this.jobService.updateJobStatus(jobId, 'FAILED', `Process exited with code ${code}`);
      }
    });
  }

  async cancel(jobId: string): Promise<void> {
    const child = this.activeJobs.get(jobId);
    if (child) {
      child.kill('SIGTERM');
      this.activeJobs.delete(jobId);
      await this.jobService.updateJobStatus(jobId, 'CANCELLED', 'Cancelled by runtime request');
    }
  }
}
