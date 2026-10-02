import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomerAcceptanceStatus } from '@prisma/client';

export interface RequestAcceptanceDto {
  projectId: string;
  clientId: string;
  deliveryId?: string;
  scope: string;
  evidence?: Record<string, any>;
  idempotencyKey?: string;
}

export interface RecordAcceptanceDto {
  status: CustomerAcceptanceStatus;
  customerActorId?: string;
  rejectionReason?: string;
  changesRequested?: string;
}

// #47: agents with these roles may request acceptance but never record the customer's decision.
export const FORBIDDEN_ACTOR_ROLES = ['SYSTEM_AGENT', 'PROJECT_MANAGER_AGENT', 'CUSTOMER_SUCCESS_AGENT'];

/** Role title → UPPER_SNAKE code ("Project Manager Agent" → PROJECT_MANAGER_AGENT); SYSTEM access counts as SYSTEM_AGENT. */
export function isForbiddenAcceptanceActor(role: { title?: string | null; accessLevel?: string | null } | null | undefined): boolean {
  if (!role) return false;
  if (role.accessLevel === 'SYSTEM') return true;
  const code = String(role.title ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return FORBIDDEN_ACTOR_ROLES.includes(code);
}

@Injectable()
export class CustomerAcceptanceService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId }, include: { role: { select: { title: true, accessLevel: true } } } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    return actor;
  }

  async requestAcceptance(companyId: string, actorId: string, dto: RequestAcceptanceDto) {
    await this.verifyActor(actorId, companyId);

    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project || project.companyId !== companyId) {
      throw new ForbiddenException('Project does not belong to company');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client does not belong to company');
    }

    if (project.clientId !== client.id) {
      throw new ForbiddenException('Client does not match project client');
    }

    if (dto.deliveryId) {
      const delivery = await this.prisma.projectDelivery.findUnique({ where: { id: dto.deliveryId } });
      if (!delivery || delivery.projectId !== dto.projectId) {
        throw new BadRequestException('Delivery does not belong to project');
      }
    }

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.customerAcceptance.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        if (existing.companyId !== companyId) {
          throw new ForbiddenException('Idempotency key belongs to different company');
        }
        return existing;
      }
    }

    return this.prisma.customerAcceptance.create({
      data: {
        companyId,
        projectId: dto.projectId,
        clientId: dto.clientId,
        deliveryId: dto.deliveryId,
        requestedById: actorId,
        scope: dto.scope,
        evidence: dto.evidence ?? {},
        status: CustomerAcceptanceStatus.PENDING,
        idempotencyKey: dto.idempotencyKey,
      },
    });
  }

  /**
   * Records a customer acceptance decision.
   * Internal employees cannot fabricate customer acceptance — they can only record
   * decisions that came from the customer (identified by customerActorId).
   * An AI agent cannot set status = ACCEPTED by invoking this internally.
   */
  async recordDecision(
    acceptanceId: string,
    companyId: string,
    actorId: string,
    dto: RecordAcceptanceDto,
  ) {
    const actor = await this.verifyActor(actorId, companyId);
    if (isForbiddenAcceptanceActor(actor.role)) {
      throw new ForbiddenException(`${actor.role?.title ?? 'This role'} cannot record a customer's acceptance decision`);
    }

    const acceptance = await this.prisma.customerAcceptance.findUnique({
      where: { id: acceptanceId },
    });
    if (!acceptance || acceptance.companyId !== companyId) {
      throw new ForbiddenException('Acceptance not found or access denied');
    }
    if (acceptance.status !== CustomerAcceptanceStatus.PENDING) {
      throw new BadRequestException(`Acceptance already decided: ${acceptance.status}`);
    }

    // An actor recording ACCEPTED must supply a customerActorId — they are recording
    // the customer's decision, not making it themselves.
    if (dto.status === CustomerAcceptanceStatus.ACCEPTED && !dto.customerActorId) {
      throw new BadRequestException(
        'customerActorId is required when recording customer acceptance — you must record who from the customer accepted',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerAcceptance.update({
        where: { id: acceptanceId },
        data: {
          status: dto.status,
          customerActorId: dto.customerActorId,
          rejectionReason: dto.rejectionReason,
          changesRequested: dto.changesRequested,
          acceptedAt: dto.status === CustomerAcceptanceStatus.ACCEPTED ? new Date() : undefined,
        },
      });

      await tx.customerAuditEvent.create({
        data: {
          companyId,
          actorId,
          actorType: 'HUMAN',
          action: 'CUSTOMER_ACCEPTANCE_RECORDED',
          objectType: 'CustomerAcceptance',
          objectId: acceptanceId,
          newValue: {
            status: dto.status,
            customerActorId: dto.customerActorId,
            rejectionReason: dto.rejectionReason,
          },
          projectId: acceptance.projectId,
          clientId: acceptance.clientId,
        },
      });

      return updated;
    });
  }

  async getAcceptance(id: string, companyId: string) {
    const acceptance = await this.prisma.customerAcceptance.findUnique({
      where: { id },
      include: { project: true, client: true, delivery: true, requestedBy: true },
    });
    if (!acceptance || acceptance.companyId !== companyId) {
      throw new ForbiddenException('Acceptance not found or access denied');
    }
    return acceptance;
  }

  async listAcceptances(companyId: string, projectId?: string) {
    return this.prisma.customerAcceptance.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
      include: { project: true, client: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
