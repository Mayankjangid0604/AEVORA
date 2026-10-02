import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientStatus } from '@prisma/client';

const LIFECYCLE_TRANSITIONS: Record<ClientStatus, ClientStatus[]> = {
  [ClientStatus.LEAD]: [ClientStatus.QUALIFIED, ClientStatus.CHURNED],
  [ClientStatus.QUALIFIED]: [ClientStatus.OPPORTUNITY, ClientStatus.CHURNED],
  [ClientStatus.OPPORTUNITY]: [ClientStatus.PROPOSAL, ClientStatus.CHURNED],
  [ClientStatus.PROPOSAL]: [ClientStatus.CONTRACT_PENDING, ClientStatus.CHURNED],
  [ClientStatus.CONTRACT_PENDING]: [ClientStatus.ONBOARDING, ClientStatus.CHURNED],
  [ClientStatus.ONBOARDING]: [ClientStatus.ACTIVE, ClientStatus.SUSPENDED, ClientStatus.CHURNED],
  [ClientStatus.ACTIVE]: [ClientStatus.AT_RISK, ClientStatus.SUSPENDED, ClientStatus.COMPLETED, ClientStatus.CHURNED],
  [ClientStatus.AT_RISK]: [ClientStatus.ACTIVE, ClientStatus.SUSPENDED, ClientStatus.CHURNED],
  [ClientStatus.SUSPENDED]: [ClientStatus.ACTIVE, ClientStatus.CHURNED],
  [ClientStatus.COMPLETED]: [ClientStatus.ACTIVE],
  [ClientStatus.CHURNED]: [],
};

@Injectable()
export class CustomerLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifyActor(actorId: string, companyId: string): Promise<void> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
  }

  async transitionCustomer(
    clientId: string,
    targetStatus: ClientStatus,
    actorId: string,
    companyId: string,
    reason?: string,
  ) {
    await this.verifyActor(actorId, companyId);

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client not found');
    if (client.companyId !== companyId) throw new ForbiddenException('Client does not belong to company');

    const allowed = LIFECYCLE_TRANSITIONS[client.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Invalid transition: ${client.status} → ${targetStatus}`,
      );
    }

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { status: targetStatus, updatedAt: new Date() },
    });

    await this.prisma.customerAuditEvent.create({
      data: {
        companyId,
        actorId,
        actorType: 'HUMAN',
        action: 'CUSTOMER_STATUS_CHANGED',
        objectType: 'Client',
        objectId: clientId,
        oldValue: { status: client.status },
        newValue: { status: targetStatus, reason },
        clientId,
      },
    });

    return updated;
  }

  async getCustomer(clientId: string, companyId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        contacts: true,
        projects: { where: { companyId } },
        contracts: { where: { companyId } },
        Invoice: { where: { companyId } },
        onboardings: { where: { companyId } },
        healthRecords: { where: { companyId }, orderBy: { calculatedAt: 'desc' }, take: 4 },
      },
    });
    if (!client || client.companyId !== companyId) {
      throw new ForbiddenException('Client not found or access denied');
    }
    return client;
  }

  async listCustomers(companyId: string, status?: ClientStatus) {
    return this.prisma.client.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: { contacts: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  validTransitions(currentStatus: ClientStatus): ClientStatus[] {
    return LIFECYCLE_TRANSITIONS[currentStatus] ?? [];
  }
}
