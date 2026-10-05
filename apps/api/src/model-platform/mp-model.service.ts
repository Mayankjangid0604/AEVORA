import { Injectable, ForbiddenException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { MpModelStatus, MpDeploymentState, MpCapabilityType, EmployeeStatus } from '@prisma/client';

const DEPLOYMENT_TRANSITIONS: Record<MpDeploymentState, MpDeploymentState[]> = {
  REGISTERED:   [MpDeploymentState.EVALUATING],
  EVALUATING:   [MpDeploymentState.APPROVED, MpDeploymentState.REGISTERED],
  APPROVED:     [MpDeploymentState.DEPLOYED],
  DEPLOYED:     [MpDeploymentState.ACTIVE, MpDeploymentState.APPROVED],
  ACTIVE:       [MpDeploymentState.DEPRECATED],
  DEPRECATED:   [MpDeploymentState.RETIRED],
  RETIRED:      [],
};

@Injectable()
export class MpModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
    return actor;
  }

  async register(companyId: string, actorId: string, dto: {
    providerId: string;
    modelIdentifier: string;
    displayName: string;
    contextWindow?: number;
    costPerInputTokenMc?: number;
    costPerOutputTokenMc?: number;
    capabilities?: MpCapabilityType[];
  }) {
    await this.verifyActor(actorId, companyId);
    const provider = await this.prisma.mpProvider.findUnique({ where: { id: dto.providerId } });
    if (!provider || provider.companyId !== companyId) throw new NotFoundException('Provider not found');

    const existing = await this.prisma.mpModel.findFirst({
      where: { companyId, providerId: dto.providerId, modelIdentifier: dto.modelIdentifier },
    });
    if (existing) throw new ConflictException('Model already registered');

    if (dto.costPerInputTokenMc !== undefined && !Number.isInteger(dto.costPerInputTokenMc))
      throw new BadRequestException('costPerInputTokenMc must be integer microcents');
    if (dto.costPerOutputTokenMc !== undefined && !Number.isInteger(dto.costPerOutputTokenMc))
      throw new BadRequestException('costPerOutputTokenMc must be integer microcents');

    const model = await this.prisma.mpModel.create({
      data: {
        companyId,
        providerId: dto.providerId,
        modelIdentifier: dto.modelIdentifier,
        displayName: dto.displayName,
        contextWindow: dto.contextWindow ?? 4096,
        costPerInputTokenMc: dto.costPerInputTokenMc ?? 0,
        costPerOutputTokenMc: dto.costPerOutputTokenMc ?? 0,
        status: MpModelStatus.REGISTERED,
        isAdvisory: true,
        registeredBy: actorId,
      },
    });

    // Create initial version tracking deployment state
    await this.prisma.mpModelVersion.create({
      data: {
        companyId,
        modelId: model.id,
        version: '1.0.0',
        deploymentState: MpDeploymentState.REGISTERED,
        createdBy: actorId,
        isAdvisory: true,
      },
    });

    if (dto.capabilities?.length) {
      await this.prisma.mpModelCapability.createMany({
        data: dto.capabilities.map(c => ({ companyId, modelId: model.id, capabilityType: c })),
        skipDuplicates: true,
      });
    }

    await this.audit.record({ companyId, actorId, action: 'MP_MODEL_REGISTERED', objectType: 'MpModel', objectId: model.id, newValue: { modelIdentifier: model.modelIdentifier } });
    return model;
  }

  async list(companyId: string, providerId?: string, status?: MpModelStatus) {
    return this.prisma.mpModel.findMany({
      where: { companyId, ...(providerId ? { providerId } : {}), ...(status ? { status } : {}) },
      include: { capabilities: { select: { capabilityType: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(companyId: string, modelId: string) {
    const m = await this.prisma.mpModel.findUnique({
      where: { id: modelId },
      include: {
        capabilities: { select: { capabilityType: true } },
        provider: { select: { displayName: true, providerType: true, status: true } },
        versions: { orderBy: { createdAt: 'desc' }, take: 1, select: { version: true, deploymentState: true } },
      },
    });
    if (!m || m.companyId !== companyId) throw new NotFoundException('Model not found');
    return m;
  }

  async advanceDeployment(companyId: string, actorId: string, modelId: string, newState: MpDeploymentState) {
    await this.verifyActor(actorId, companyId);
    const m = await this.prisma.mpModel.findUnique({ where: { id: modelId } });
    if (!m || m.companyId !== companyId) throw new NotFoundException('Model not found');

    // Get current deployment state from latest version
    const latest = await this.prisma.mpModelVersion.findFirst({
      where: { modelId },
      orderBy: { createdAt: 'desc' },
    });

    const currentState = latest?.deploymentState ?? MpDeploymentState.REGISTERED;
    const allowed = DEPLOYMENT_TRANSITIONS[currentState];
    if (!allowed.includes(newState)) throw new BadRequestException(`Cannot transition ${currentState} → ${newState}`);

    if (newState === MpDeploymentState.APPROVED && m.registeredBy === actorId)
      throw new ForbiddenException('Actor who registered the model cannot approve it (self-approval)');

    await this.prisma.mpModelVersion.update({
      where: { id: latest!.id },
      data: { deploymentState: newState, ...(newState === MpDeploymentState.APPROVED ? { approvedBy: actorId, approvedAt: new Date() } : {}) },
    });

    // Sync model status to reflect deployment
    let newStatus = m.status;
    if (newState === MpDeploymentState.ACTIVE) newStatus = MpModelStatus.ACTIVE;
    if (newState === MpDeploymentState.RETIRED) newStatus = MpModelStatus.RETIRED;
    if (newState !== m.status as any) await this.prisma.mpModel.update({ where: { id: modelId }, data: { status: newStatus } });

    await this.audit.record({ companyId, actorId, action: 'MP_MODEL_DEPLOYMENT_ADVANCED', objectType: 'MpModel', objectId: modelId, oldValue: { deploymentState: currentState }, newValue: { deploymentState: newState } });
    return { id: modelId, deploymentState: newState };
  }
}
