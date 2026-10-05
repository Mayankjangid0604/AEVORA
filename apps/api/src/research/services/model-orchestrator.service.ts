import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskPriorityInferenceRuntime } from '../inference/task-priority-inference.runtime';
import { TaskRiskInferenceRuntime } from '../inference/task-risk-inference.runtime';
import { ModelInferenceRuntime } from '../inference/model-inference.runtime';
import { ModelVersionStatus } from '@prisma/client';

export interface InferenceRequest {
  companyId: string;
  capabilityName: string; // e.g., TASK_PRIORITY_CLASSIFICATION
  input: any;
  context?: any;
}

export interface InferenceResult {
  capability: string;
  modelVersionId: string;
  prediction: any;
  confidence: number;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  status: string;
}

@Injectable()
export class ModelOrchestratorService {
  private readonly logger = new Logger(ModelOrchestratorService.name);
  private runtimes = new Map<string, ModelInferenceRuntime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskPriorityRuntime: TaskPriorityInferenceRuntime,
    private readonly taskRiskRuntime: TaskRiskInferenceRuntime,
  ) {
    this.runtimes.set(taskPriorityRuntime.getCapabilityId(), taskPriorityRuntime);
    this.runtimes.set(taskRiskRuntime.getCapabilityId(), taskRiskRuntime);
  }

  async runInference(req: InferenceRequest): Promise<InferenceResult> {
    const startTime = Date.now();
    let success = false;
    let fallbackUsed = false;
    let fallbackReason = undefined;
    let errorReason = undefined;
    let prediction = null;
    let confidence = 0;
    let modelVersionId = null;
    let deploymentId = null;

    try {
      // 1. Resolve Capability
      const capability = await this.prisma.modelCapability.findFirst({
        where: { name: req.capabilityName, companyId: req.companyId }
      });
      if (!capability || capability.status !== 'ACTIVE') {
        throw new NotFoundException(`Capability ${req.capabilityName} not found or not active`);
      }
      
      // 2. Find eligible deployments for this capability in the given company
      // Must be ACTIVE deployment, model status in [PRODUCTION, LIMITED_DEPLOYMENT]
      const deployments = await this.prisma.limitedDeployment.findMany({
        where: {
          status: 'ACTIVE',
          modelVersion: {
            modelFamily: {
              capabilityId: capability.id,
              // check company ownership or global (companyId = null)
              OR: [{ companyId: req.companyId }, { companyId: null }]
            },
            status: {
              in: [ModelVersionStatus.PRODUCTION, ModelVersionStatus.LIMITED_DEPLOYMENT]
            }
          }
        },
        include: {
          modelVersion: {
            include: { modelFamily: true }
          }
        }
      });

      if (deployments.length === 0) {
        throw new NotFoundException(`No active deployments found for capability ${req.capabilityName}`);
      }

      // 3. Select Model (Deterministic: pick PRODUCTION first, then by newest created)
      deployments.sort((a, b) => {
        if (a.modelVersion.status === ModelVersionStatus.PRODUCTION && b.modelVersion.status !== ModelVersionStatus.PRODUCTION) return -1;
        if (a.modelVersion.status !== ModelVersionStatus.PRODUCTION && b.modelVersion.status === ModelVersionStatus.PRODUCTION) return 1;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

      const selectedDeployment = deployments[0];

      deploymentId = selectedDeployment.id;
      modelVersionId = selectedDeployment.modelVersion.id;
      const artifactRef = selectedDeployment.modelVersion.artifactRef;

      if (!artifactRef) {
        throw new BadRequestException('Selected model version has no artifact reference');
      }

      // 4. Find Runtime adapter
      const runtime = this.runtimes.get(req.capabilityName);
      if (!runtime) {
        throw new BadRequestException(`No inference runtime registered for ${req.capabilityName}`);
      }

      // 5. Execute Inference
      const predictions = await runtime.executeInference(artifactRef, req.input);

      // Parse output. It should be a list of probabilities for classification
      // find max
      let maxIdx = 0;
      for(let i=1; i<predictions.length; i++) {
        if (predictions[i] > predictions[maxIdx]) maxIdx = i;
      }
      confidence = predictions[maxIdx];

      // Standard output schemas mapping indices to strings (done by service layer, or simple mapping here)
      // Actually, we'll return raw maxIdx or mapped string depending on the capability
      let isValidOutput = false;
      if (req.capabilityName === 'TASK_PRIORITY_CLASSIFICATION') {
        const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
        prediction = priorities[maxIdx];
        isValidOutput = prediction !== undefined;
      } else if (req.capabilityName === 'TASK_RISK_CLASSIFICATION') {
        const risks = ['LOW', 'MEDIUM', 'HIGH'];
        prediction = risks[maxIdx];
        isValidOutput = prediction !== undefined;
      } else {
        prediction = maxIdx;
        isValidOutput = true;
      }

      // 6. Check Confidence Threshold & Output Validation
      if (!isValidOutput) {
        fallbackUsed = true;
        fallbackReason = `Prediction index ${maxIdx} out of bounds for output schema`;
      } else if (confidence < capability.confidenceThreshold) {
        fallbackUsed = true;
        fallbackReason = `Confidence ${confidence} is below threshold ${capability.confidenceThreshold}`;
      }

      if (fallbackUsed) {
        // Apply deterministic fallback based on capability
        if (req.capabilityName === 'TASK_PRIORITY_CLASSIFICATION') {
          prediction = 'NORMAL';
        } else if (req.capabilityName === 'TASK_RISK_CLASSIFICATION') {
          prediction = 'MEDIUM';
        }
      }

      success = true;

    } catch (e: any) {
      this.logger.error(`Orchestrator Inference Error: ${e.message}`);
      success = false;
      errorReason = e.message;
      fallbackUsed = true;
      fallbackReason = `Inference execution failed: ${e.message}`;
      
      // Hard fallback if entirely failed
      if (req.capabilityName === 'TASK_PRIORITY_CLASSIFICATION') {
        prediction = 'NORMAL';
      } else if (req.capabilityName === 'TASK_RISK_CLASSIFICATION') {
        prediction = 'MEDIUM';
      }
    }

    const latencyMs = Date.now() - startTime;

    // 7. Record Telemetry
    if (modelVersionId) {
       await this.prisma.inferenceLog.create({
         data: {
           deploymentId,
           modelVersionId,
           capabilityId: req.capabilityName,
           companyId: req.companyId,
           latencyMs,
           success,
           fallbackUsed,
           fallbackReason,
           confidence,
           prediction,
           errorReason
         }
       });
    }

    return {
      capability: req.capabilityName,
      modelVersionId,
      prediction,
      confidence,
      latencyMs,
      fallbackUsed,
      fallbackReason,
      status: success ? 'SUCCESS' : 'FALLBACK'
    };
  }
}
