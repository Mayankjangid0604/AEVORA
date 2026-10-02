import { Injectable, Logger } from '@nestjs/common';
import { TrainingExecutor, TrainingExecutionResult } from './training.executor.interface';
import { TrainingConfiguration, TrainingRunAttempt, ModelTrainingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class LocalPythonTrainingExecutor implements TrainingExecutor {
  private readonly logger = new Logger(LocalPythonTrainingExecutor.name);
  private activeJobs = new Map<string, ChildProcess>();

  constructor(private readonly prisma: PrismaService) {}

  getIdentifier(): string {
    return 'LOCAL_PYTHON';
  }

  async execute(
    configuration: TrainingConfiguration,
    attempt: TrainingRunAttempt,
    datasetPaths: string[]
  ): Promise<TrainingExecutionResult> {
    this.logger.log(`Starting local Python training for attempt ${attempt.id}`);

    const scriptsDir = path.join(process.cwd(), 'apps', 'api', 'scripts', 'ml');
    let trainScript = path.join(scriptsDir, 'train_model.py');
    const isTaskPriority = datasetPaths && datasetPaths.length > 0 && datasetPaths[0].includes('task_priority');
    const isTaskRisk = datasetPaths && datasetPaths.length > 0 && datasetPaths[0].includes('task_risk');
    if (isTaskPriority) {
      trainScript = path.join(scriptsDir, 'train_task_priority.py');
    } else if (isTaskRisk) {
      trainScript = path.join(scriptsDir, 'train_task_risk.py');
    }

    if (!fs.existsSync(trainScript)) {
      return {
        status: ModelTrainingStatus.FAILED,
        failureReason: `Training script not found at ${trainScript}`
      };
    }
    
    const outputDir = path.join(process.cwd(), '.temp', 'training', attempt.id);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    let datasetPath = datasetPaths && datasetPaths.length > 0 ? datasetPaths[0] : '';
    if (!datasetPath && !isTaskPriority && !isTaskRisk) {
      datasetPath = path.join(process.cwd(), '.temp', 'dataset', 'xor_dataset.csv');
    }
    
    const artifactPath = path.join(outputDir, `model_artifact.pt`);
    const hp: any = configuration.hyperparameters || {};
    const epochs = hp.epochs || 100;
    
    let resolvePromise: (res: TrainingExecutionResult) => void;
    const executionPromise = new Promise<TrainingExecutionResult>((resolve) => {
      resolvePromise = resolve;
    });

    let args: string[] = [];
    if (isTaskPriority || isTaskRisk) {
      const trainCsv = datasetPaths[0];
      const valCsv = datasetPaths.length > 1 ? datasetPaths[1] : datasetPaths[0];
      args = [trainCsv, valCsv, String(epochs), String(hp.lr || 0.01), outputDir];
    } else {
      args = [datasetPath, artifactPath, String(epochs)];
    }

    const child = spawn('python', [trainScript, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    this.activeJobs.set(attempt.id, child);
    
    const startTime = Date.now();
    let artifactRef = '';
    let artifactChecksum = '';
    let finalLoss = 0;
    
    child.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim() !== '');
      for (const line of lines) {
        if (line.startsWith('METRIC_LOG|loss|')) {
          const parts = line.split('|');
          finalLoss = parseFloat(parts[2]);
          const step = parseInt(parts[3]);
          try {
            await this.prisma.trainingMetric.create({
              data: {
                attemptId: attempt.id,
                step,
                epoch: step,
                name: 'loss',
                value: finalLoss,
                metricType: 'SCALAR'
              }
            });
          } catch(e) {}
        } else if (line.startsWith('ARTIFACT_CREATED|')) {
          const parts = line.split('|');
          artifactRef = parts[1];
          if (parts.length > 2) {
             artifactChecksum = parts[2];
          }
          this.logger.log(`Artifact created at: ${artifactRef} with hash ${artifactChecksum}`);
          try {
            await this.prisma.trainingCheckpoint.create({
              data: {
                attemptId: attempt.id,
                checkpointNumber: 1,
                step: epochs,
                artifactRef: artifactRef,
                checksum: artifactChecksum,
              }
            });
          } catch (e) {}
        } else if (line.startsWith('Artifact created at: ')) {
          artifactRef = line.split('Artifact created at: ')[1].trim();
          this.logger.log(`Parsed Artifact created at: ${artifactRef}`);
        } else {
          this.logger.log(`[TRAIN] ${line}`);
        }
      }
    });

    let stderrOutput = '';
    child.stderr.on('data', (data) => {
      stderrOutput += data.toString();
      this.logger.warn(`[TRAIN ERROR] ${data.toString()}`);
    });

    child.on('close', (code) => {
      this.activeJobs.delete(attempt.id);
      const runtimeMs = Date.now() - startTime;
      
      if (code === 0) {
        resolvePromise({
          status: ModelTrainingStatus.COMPLETED,
          metrics: {
            finalLoss,
            epochsCompleted: epochs,
            throughput: 'N/A (Local Python)'
          },
          resourceConsumption: {
            runtimeMs,
            computeUnits: 200,
            peakMemoryMb: 512
          },
          artifactRef: artifactRef
        });
      } else {
        resolvePromise({
          status: ModelTrainingStatus.FAILED,
          failureReason: `Python process exited with code ${code}. Stderr: ${stderrOutput}`
        });
      }
    });

    return executionPromise;
  }

  async cancel(attemptId: string): Promise<boolean> {
    const child = this.activeJobs.get(attemptId);
    if (child) {
      child.kill('SIGTERM');
      this.activeJobs.delete(attemptId);
      return true;
    }
    return false;
  }

  async getStatus(attemptId: string): Promise<ModelTrainingStatus> {
    return this.activeJobs.has(attemptId) ? ModelTrainingStatus.RUNNING : ModelTrainingStatus.COMPLETED; // Simplified
  }
}
