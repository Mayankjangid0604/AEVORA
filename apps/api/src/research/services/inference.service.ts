import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocalPythonInferenceRuntime } from '../inference/local-python-inference.runtime';
import { ModelVersionStatus } from '@prisma/client';
import { ModelOrchestratorService, InferenceRequest, InferenceResult } from './model-orchestrator.service';

@Injectable()
export class InferenceService {
  private readonly logger = new Logger(InferenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtime: LocalPythonInferenceRuntime,
    private readonly orchestrator: ModelOrchestratorService
  ) {}

  async runCapabilityInference(req: InferenceRequest): Promise<InferenceResult> {
    return this.orchestrator.runInference(req);
  }

  async runInference(deploymentId: string, payload: any, requestingCompanyId: string) {
    const startTime = Date.now();
    let success = false;
    let errorReason = undefined;

    const deployment = await this.prisma.limitedDeployment.findUnique({
      where: { id: deploymentId },
      include: { modelVersion: true }
    });

    if (!deployment || deployment.status !== 'ACTIVE') {
      throw new BadRequestException('Deployment is not active or does not exist');
    }

    const version = deployment.modelVersion;
    if (version.status !== ModelVersionStatus.LIMITED_DEPLOYMENT && version.status !== ModelVersionStatus.PRODUCTION) {
      throw new BadRequestException('Model version is not approved for deployment');
    }

    if (!requestingCompanyId) {
      throw new BadRequestException('Requesting company context is strictly required for inference logs');
    }

    if (version.companyId !== requestingCompanyId) {
      throw new BadRequestException('Unauthorized: Cross-tenant model access is forbidden');
    }

    if (!version.artifactRef) {
      throw new BadRequestException('Model version has no artifact reference');
    }

    try {
      const predictions = await this.runtime.executeInference(version.artifactRef, payload);
      success = true;
      return { predictions, latencyMs: Date.now() - startTime };
    } catch (e: any) {
      errorReason = e.message;
      throw e;
    } finally {
      // Record monitoring log
      const latencyMs = Date.now() - startTime;
      await this.prisma.inferenceLog.create({
        data: {
          deploymentId,
          modelVersionId: version.id,
          // Explicitly use the validated requesting context, not a fallback or silent fabrication.
          companyId: requestingCompanyId, 
          latencyMs,
          success,
          errorReason
        }
      });
    }
  }
}
