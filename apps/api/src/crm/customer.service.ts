import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClientStatus } from '@prisma/client';
import { StructuredLoggerService } from '../logger/structured-logger.service';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly structuredLogger: StructuredLoggerService
  ) {}

  async createLead(companyId: string, actorId: string, name: string, organizationName?: string): Promise<any> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }

    const client = await this.prisma.client.create({
      data: {
        companyId,
        name,
        organizationName,
        status: ClientStatus.LEAD
      }
    });

    this.structuredLogger.log(`Client ${client.id} created as LEAD by ${actorId}`, CustomerService.name, { companyId, actorId, clientId: client.id });

    return client;
  }

  async advanceStatus(companyId: string, actorId: string, clientId: string, targetStatus: ClientStatus): Promise<any> {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }

    const client = await this.prisma.client.findFirst({ where: { id: clientId, companyId } });
    if (!client) throw new BadRequestException('Client not found or does not belong to company');

    const allowedTransitions: Record<ClientStatus, ClientStatus[]> = {
      [ClientStatus.LEAD]: [ClientStatus.QUALIFIED],
      [ClientStatus.QUALIFIED]: [ClientStatus.OPPORTUNITY],
      [ClientStatus.OPPORTUNITY]: [ClientStatus.PROPOSAL],
      [ClientStatus.PROPOSAL]: [ClientStatus.CONTRACT_PENDING],
      [ClientStatus.CONTRACT_PENDING]: [ClientStatus.ONBOARDING, ClientStatus.ACTIVE],
      [ClientStatus.ONBOARDING]: [ClientStatus.ACTIVE],
      [ClientStatus.ACTIVE]: [ClientStatus.AT_RISK, ClientStatus.SUSPENDED, ClientStatus.COMPLETED],
      [ClientStatus.AT_RISK]: [ClientStatus.ACTIVE, ClientStatus.SUSPENDED],
      [ClientStatus.SUSPENDED]: [ClientStatus.ACTIVE],
      [ClientStatus.COMPLETED]: [],
      [ClientStatus.CHURNED]: [],
    };

    const allowed = allowedTransitions[client.status];
    if (!allowed || !allowed.includes(targetStatus)) {
      throw new BadRequestException(`Cannot transition client from ${client.status} to ${targetStatus}`);
    }

    const updated = await this.prisma.client.update({
      where: { id: clientId },
      data: { status: targetStatus }
    });

    this.structuredLogger.log(`Client ${clientId} transitioned from ${client.status} to ${targetStatus} by ${actorId}`, CustomerService.name, { companyId, actorId, clientId, oldStatus: client.status, newStatus: targetStatus });

    return updated;
  }
}
