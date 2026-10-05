import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ManagementAuditService } from '../management/management-audit.service';
import { MpInferenceOutcome, MpKillSwitchScope, MpModelStatus, MpProviderStatus, EmployeeStatus } from '@prisma/client';
import { MpKillSwitchService } from './mp-kill-switch.service';

const INFERENCE_ALLOWED_STATUSES = new Set<MpModelStatus>([MpModelStatus.ACTIVE, MpModelStatus.DEGRADED]);

@Injectable()
export class MpInferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: ManagementAuditService,
    private readonly killSwitch: MpKillSwitchService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor not in company');
    if (actor.status !== EmployeeStatus.ACTIVE) throw new ForbiddenException('Actor not active');
  }

  /** Hash request content — never store raw prompt */
  private hashRequest(content: string): string {
    const salt = randomBytes(8).toString('hex');
    return createHash('sha256').update(salt + content).digest('hex').slice(0, 32);
  }

  async execute(companyId: string, actorId: string, dto: {
    modelId: string;
    idempotencyKey: string;
    promptContent: string; // used for hashing only — never persisted
    environment?: string;
  }) {
    await this.verifyActor(actorId, companyId);

    // Idempotency check
    const existing = await this.prisma.mpInferenceExecution.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key conflict');
      return existing;
    }

    const model = await this.prisma.mpModel.findUnique({
      where: { id: dto.modelId },
      include: { provider: { select: { status: true } } },
    });
    if (!model || model.companyId !== companyId) throw new NotFoundException('Model not found');
    if (!INFERENCE_ALLOWED_STATUSES.has(model.status))
      throw new ForbiddenException(`Model status '${model.status}' does not allow inference`);
    const providerStatus = model.provider?.status;
    if (providerStatus !== MpProviderStatus.ACTIVE && providerStatus !== MpProviderStatus.DEGRADED)
      throw new ForbiddenException(`Provider status '${providerStatus}' does not allow inference`);

    // Kill switch check — fail closed
    const blocked = await this.killSwitch.isBlocked(companyId, {
      providerId: model.providerId,
      modelId: model.id,
      scope: MpKillSwitchScope.ALL_INFERENCE,
    });
    if (blocked) throw new ForbiddenException('Inference blocked by kill switch');

    const requestHash = this.hashRequest(dto.promptContent);

    let execution;
    try {
      execution = await this.prisma.mpInferenceExecution.create({
        data: {
          companyId,
          modelId: dto.modelId,
          actorId,
          capabilityType: 'TEXT_GENERATION',
          idempotencyKey: dto.idempotencyKey,
          requestHash, // salted hash only — raw prompt never stored
          outcome: MpInferenceOutcome.SUCCESS,
          environment: dto.environment ?? 'SANDBOX',
          isAdvisory: true,
        },
      });
    } catch (e: any) {
      // P2002: concurrent create with same idempotencyKey — return winner's record
      if (e?.code === 'P2002') {
        const existing = await this.prisma.mpInferenceExecution.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });
        if (existing && existing.companyId === companyId) return existing;
      }
      throw e;
    }

    await this.audit.record({ companyId, actorId, action: 'MP_INFERENCE_EXECUTED', objectType: 'MpInferenceExecution', objectId: execution.id, newValue: { modelId: dto.modelId, environment: execution.environment } });
    return execution;
  }

  async list(companyId: string, modelId?: string, limit = 50) {
    if (limit > 200) limit = 200;
    return this.prisma.mpInferenceExecution.findMany({
      where: { companyId, ...(modelId ? { modelId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, companyId: true, modelId: true, actorId: true,
        idempotencyKey: true, outcome: true, totalLatencyMs: true, inputTokens: true,
        outputTokens: true, estimatedCostMc: true, actualCostMc: true,
        environment: true, isAdvisory: true, createdAt: true,
        requestHash: true, fallbackUsed: true, errorClass: true,
      },
    });
  }
}
