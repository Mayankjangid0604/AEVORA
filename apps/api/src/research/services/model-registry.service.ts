import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ModelVersionStatus } from '@prisma/client';

import { ProductionExecutionGateService } from '../../production/production-execution-gate.service';
import { ExecutionEnvironment } from '@prisma/client';

@Injectable()
export class ModelRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionGate: ProductionExecutionGateService
  ) {}

  async registerModelFamily(name: string, description: string, provider: string = 'AEVORA_INTERNAL') {
    return this.prisma.modelFamily.create({
      data: { name, description, provider },
    });
  }

  async registerModelVersion(data: {
    modelId: string;
    version: string;
    artifactRef: string;
    baseModelId?: string;
    parentModelId?: string;
    trainingExpId?: string;
    metadata?: any;
    createdBy: string;
  }) {
    // Immutability rule: creating a new version rather than mutating.
    return this.prisma.modelVersion.create({
      data: {
        modelId: data.modelId,
        version: data.version,
        artifactRef: data.artifactRef,
        baseModelId: data.baseModelId,
        parentModelId: data.parentModelId,
        trainingExpId: data.trainingExpId,
        metadata: data.metadata || {},
        createdBy: data.createdBy,
        status: ModelVersionStatus.EXPERIMENTAL,
      },
    });
  }

  async getModelVersion(versionId: string) {
    const version = await this.prisma.modelVersion.findUnique({
      where: { id: versionId },
      include: { modelFamily: true }
    });
    if (!version) throw new NotFoundException('Model version not found');
    return version;
  }

  async updateModelVersion(_versionId: string, _data: any) {
    throw new BadRequestException('Model versions are strictly immutable. Create a new version instead.');
  }

  async requestPromotion(versionId: string, requestedState: ModelVersionStatus, actorId: string, companyId: string, approvalId?: string) {
    const version = await this.getModelVersion(versionId);

    const actor = await this.prisma.employee.findUnique({ where: { id: actorId }, include: { role: true } });
    if (!actor || actor.role?.title !== 'CHAIRMAN') {
      throw new BadRequestException('Only a Chairman can authorize production deployments');
    }

    if (this.executionGate) {
      await this.executionGate.authorizeProductionAction({
        actorId,
        companyId,
        environment: ExecutionEnvironment.PRODUCTION,
        capability: 'PROMOTE_MODEL',
        action: 'PROMOTE',
        resourceId: versionId,
        approvalId,
        parameters: {},
      });
    }

    if (requestedState === ModelVersionStatus.PRODUCTION && (version.metadata as any)?.isSimulated) {
      throw new BadRequestException('SIMULATED artifacts cannot progress to PRODUCTION.');
    }

    // Verify gates
    const gates = await this.prisma.promotionGateRecord.findMany({
      where: { modelVersionId: versionId }
    });

    const requiredGates = ['PROVENANCE', 'REPRODUCIBILITY', 'EVALUATION', 'SAFETY'];
    const passedGates = gates.filter(g => g.status === 'PASS').map(g => g.gateType);

    for (const gate of requiredGates) {
      if (!passedGates.includes(gate)) {
        throw new BadRequestException(`Cannot promote model. Required gate failed or missing: ${gate}`);
      }
    }

    return this.prisma.modelVersion.update({
      where: { id: versionId },
      data: { status: requestedState },
    });
  }

  async startLimitedDeployment(versionId: string, data: {
    scope: string;
    allowedAgents: string[];
    allowedWorkloads: string[];
    resourceLimits: any;
  }) {
    const version = await this.getModelVersion(versionId);
    if (version.status !== ModelVersionStatus.APPROVED_FOR_LIMITED_DEPLOYMENT && version.status !== ModelVersionStatus.PRODUCTION) {
      throw new BadRequestException('Model must be approved for limited deployment to deploy');
    }

    const deployment = await this.prisma.limitedDeployment.create({
      data: {
        modelVersionId: versionId,
        scope: data.scope,
        allowedAgents: data.allowedAgents,
        allowedWorkloads: data.allowedWorkloads,
        resourceLimits: data.resourceLimits,
        startedAt: new Date(),
        status: 'ACTIVE'
      }
    });

    await this.prisma.modelVersion.update({
      where: { id: versionId },
      data: { status: ModelVersionStatus.LIMITED_DEPLOYMENT }
    });

    return deployment;
  }

  async rollbackDeployment(deploymentId: string, rollbackTargetVersionId: string) {
    const deployment = await this.prisma.limitedDeployment.findUnique({ where: { id: deploymentId }});
    if (!deployment) throw new NotFoundException('Deployment not found');

    if (deployment.status !== 'ACTIVE') {
      throw new BadRequestException('Can only rollback active deployments');
    }

    // Mark current model as rolled back
    await this.prisma.modelVersion.update({
      where: { id: deployment.modelVersionId },
      data: { status: ModelVersionStatus.ROLLED_BACK }
    });

    // Update the deployment record
    return this.prisma.limitedDeployment.update({
      where: { id: deploymentId },
      data: {
        status: 'ROLLED_BACK',
        endedAt: new Date(),
        rollbackTargetId: rollbackTargetVersionId
      }
    });
  }

  async createPromotionGate(modelVersionId: string, gateType: string, status: string, evidence: string, evaluatorId: string, role?: string, companyId?: string, approvalId?: string) {
    let targetCompanyId = companyId;
    if (!targetCompanyId) {
      const version = await this.prisma.modelVersion.findUnique({ where: { id: modelVersionId }});
      if (version) targetCompanyId = version.companyId;
    }

    if (this.executionGate && targetCompanyId) {
      await this.executionGate.authorizeProductionAction({
        actorId: evaluatorId,
        companyId: targetCompanyId,
        environment: ExecutionEnvironment.PRODUCTION,
        capability: 'CREATE_PROMOTION_GATE',
        action: 'CREATE',
        resourceId: modelVersionId,
        approvalId,
        parameters: {},
      });
    }

    return this.prisma.promotionGateRecord.create({
      data: {
        modelVersionId,
        gateType,
        status,
        evidence,
        evaluatorId
      }
    });
  }
}
