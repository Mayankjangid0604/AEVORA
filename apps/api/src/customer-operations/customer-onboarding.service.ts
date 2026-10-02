import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingStatus, ClientStatus } from '@prisma/client';

export interface CreateOnboardingDto {
  clientId: string;
  contractId?: string;
  projectId?: string;
  ownerId?: string;
  requirements?: string;
  scope?: string;
  deliverables?: string;
  timeline?: string;
  billingInfo?: Record<string, any>;
  communicationPref?: string;
  dueAt?: Date;
}

export interface UpdateOnboardingDto {
  ownerId?: string;
  requirements?: string;
  scope?: string;
  deliverables?: string;
  timeline?: string;
  billingInfo?: Record<string, any>;
  communicationPref?: string;
  notes?: string;
  dueAt?: Date;
  checklist?: any[];
}

@Injectable()
export class CustomerOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
  }

  async createOnboarding(companyId: string, actorId: string, dto: CreateOnboardingDto) {
    await this.verifyActor(actorId, companyId);

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client does not belong to company');
    }

    if (dto.contractId) {
      const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
      if (!contract || contract.companyId !== companyId) {
        throw new ForbiddenException('Contract does not belong to company');
      }
    }

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project || project.companyId !== companyId) {
        throw new ForbiddenException('Project does not belong to company');
      }
    }

    if (dto.ownerId) {
      const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
      if (!owner || owner.companyId !== companyId) {
        throw new ForbiddenException('Owner does not belong to company');
      }
    }

    const defaultChecklist = [
      { item: 'Verify customer contacts', completed: false },
      { item: 'Confirm billing information', completed: false },
      { item: 'Document scope and requirements', completed: false },
      { item: 'Set up project workspace', completed: false },
      { item: 'Assign account owner', completed: false },
      { item: 'Schedule kickoff meeting', completed: false },
    ];

    return this.prisma.customerOnboarding.create({
      data: {
        companyId,
        clientId: dto.clientId,
        contractId: dto.contractId,
        projectId: dto.projectId,
        ownerId: dto.ownerId,
        requirements: dto.requirements,
        scope: dto.scope,
        deliverables: dto.deliverables,
        timeline: dto.timeline,
        billingInfo: dto.billingInfo ?? {},
        communicationPref: dto.communicationPref,
        checklist: defaultChecklist,
        dueAt: dto.dueAt,
      },
    });
  }

  async updateOnboarding(id: string, companyId: string, actorId: string, dto: UpdateOnboardingDto) {
    await this.verifyActor(actorId, companyId);

    const onboarding = await this.prisma.customerOnboarding.findUnique({ where: { id } });
    if (!onboarding || onboarding.companyId !== companyId) {
      throw new ForbiddenException('Onboarding not found or access denied');
    }
    if (onboarding.status === OnboardingStatus.COMPLETED) {
      throw new BadRequestException('Cannot update a completed onboarding');
    }

    if (dto.ownerId) {
      const owner = await this.prisma.employee.findUnique({ where: { id: dto.ownerId } });
      if (!owner || owner.companyId !== companyId) {
        throw new ForbiddenException('Owner does not belong to company');
      }
    }

    return this.prisma.customerOnboarding.update({
      where: { id },
      data: {
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
        ...(dto.requirements !== undefined && { requirements: dto.requirements }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.deliverables !== undefined && { deliverables: dto.deliverables }),
        ...(dto.timeline !== undefined && { timeline: dto.timeline }),
        ...(dto.billingInfo !== undefined && { billingInfo: dto.billingInfo }),
        ...(dto.communicationPref !== undefined && { communicationPref: dto.communicationPref }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.dueAt !== undefined && { dueAt: dto.dueAt }),
        ...(dto.checklist !== undefined && { checklist: dto.checklist }),
      },
    });
  }

  async completeOnboarding(id: string, companyId: string, actorId: string) {
    await this.verifyActor(actorId, companyId);

    const onboarding = await this.prisma.customerOnboarding.findUnique({ where: { id } });
    if (!onboarding || onboarding.companyId !== companyId) {
      throw new ForbiddenException('Onboarding not found or access denied');
    }
    if (onboarding.status !== OnboardingStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot complete onboarding in status: ${onboarding.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerOnboarding.update({
        where: { id },
        data: { status: OnboardingStatus.COMPLETED, completedAt: new Date() },
      });

      // Transition client to ACTIVE if still ONBOARDING
      const client = await tx.client.findUnique({ where: { id: onboarding.clientId } });
      if (client?.status === ClientStatus.ONBOARDING) {
        await tx.client.update({
          where: { id: onboarding.clientId },
          data: { status: ClientStatus.ACTIVE },
        });
      }

      await tx.customerAuditEvent.create({
        data: {
          companyId,
          actorId,
          actorType: 'HUMAN',
          action: 'ONBOARDING_COMPLETED',
          objectType: 'CustomerOnboarding',
          objectId: id,
          clientId: onboarding.clientId,
        },
      });

      return updated;
    });
  }

  async getOnboarding(id: string, companyId: string) {
    const onboarding = await this.prisma.customerOnboarding.findUnique({
      where: { id },
      include: { client: true, contract: true, project: true, owner: true },
    });
    if (!onboarding || onboarding.companyId !== companyId) {
      throw new ForbiddenException('Onboarding not found or access denied');
    }
    return onboarding;
  }

  async listOnboardings(companyId: string, clientId?: string) {
    return this.prisma.customerOnboarding.findMany({
      where: { companyId, ...(clientId ? { clientId } : {}) },
      include: { client: true, owner: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async detectIncomplete(companyId: string) {
    const now = new Date();
    const overdue = await this.prisma.customerOnboarding.findMany({
      where: {
        companyId,
        status: OnboardingStatus.IN_PROGRESS,
        dueAt: { lt: now },
      },
      include: { client: true },
    });
    return overdue;
  }
}
