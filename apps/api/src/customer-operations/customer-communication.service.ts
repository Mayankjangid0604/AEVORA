import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationStatus, ExecutionEnvironment } from '@prisma/client';

export interface CreateCommunicationDto {
  clientId: string;
  projectId?: string;
  channel: string;
  subject: string;
  body: string;
  intent: string;
  idempotencyKey?: string;
}

@Injectable()
export class CustomerCommunicationService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
  }

  async draftCommunication(companyId: string, actorId: string, dto: CreateCommunicationDto) {
    await this.verifyActor(actorId, companyId);

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client does not belong to company');
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.companyId !== companyId) {
        throw new ForbiddenException('Project does not belong to company');
      }
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.customerCommunication.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        if (existing.companyId !== companyId) throw new ForbiddenException('Idempotency key belongs to different company');
        return existing;
      }
    }

    return this.prisma.customerCommunication.create({
      data: {
        companyId,
        clientId: dto.clientId,
        projectId: dto.projectId,
        draftedById: actorId,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        intent: dto.intent,
        status: CommunicationStatus.DRAFT,
        idempotencyKey: dto.idempotencyKey,
      },
    });
  }

  /**
   * Attempt to send a customer communication.
   * External production sends MUST go through the ProductionExecutionGateService.
   * This service enforces that rule by checking production capabilities.
   */
  async attemptSend(id: string, companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);

    const comm = await this.prisma.customerCommunication.findUnique({ where: { id } });
    if (!comm || comm.companyId !== companyId) {
      throw new ForbiddenException('Communication not found or access denied');
    }

    if (comm.status !== CommunicationStatus.DRAFT && comm.status !== CommunicationStatus.APPROVED) {
      throw new BadRequestException(`Cannot send communication in status: ${comm.status}`);
    }

    // Check production capability (CUSTOMER_EMAIL)
    const capability = await this.prisma.productionCapability.findUnique({
      where: { companyId_capability_environment: { companyId, capability: 'CUSTOMER_EMAIL', environment: ExecutionEnvironment.PRODUCTION } },
    });

    if (!capability?.isEnabled) {
      // Fail closed — no capability means no send
      await this.prisma.customerCommunication.update({
        where: { id },
        data: {
          status: CommunicationStatus.FAILED,
          error: 'Production CUSTOMER_EMAIL capability not enabled. External communications require production approval.',
        },
      });
      throw new BadRequestException('External communication not permitted: CUSTOMER_EMAIL capability not enabled');
    }

    // Check kill switch
    const killSwitch = await this.prisma.killSwitchConfig.findUnique({
      where: { companyId_feature: { companyId, feature: 'OUTBOUND_EMAIL' } },
    });
    if (killSwitch?.isDisabled) {
      throw new BadRequestException('Outbound email kill switch is active');
    }

    // Approved — mark as sent (in real implementation this would call the provider)
    return this.prisma.customerCommunication.update({
      where: { id },
      data: { status: CommunicationStatus.SENT, sentAt: new Date() },
    });
  }

  async listCommunications(companyId: string, clientId?: string) {
    return this.prisma.customerCommunication.findMany({
      where: { companyId, ...(clientId ? { clientId } : {}) },
      include: { client: true, draftedBy: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
