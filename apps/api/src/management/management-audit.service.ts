import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManagementAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: {
    companyId: string;
    actorId: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    cycleId?: string;
  }) {
    return this.prisma.managementAuditEvent.create({
      data: {
        companyId: event.companyId,
        actorId: event.actorId,
        action: event.action,
        objectType: event.objectType,
        objectId: event.objectId,
        oldValue: event.oldValue !== undefined ? (event.oldValue as any) : undefined,
        newValue: event.newValue !== undefined ? (event.newValue as any) : undefined,
        cycleId: event.cycleId,
      },
    });
  }

  async getAuditTrail(companyId: string, limit = 100, offset = 0) {
    return this.prisma.managementAuditEvent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getObjectAuditTrail(companyId: string, objectType: string, objectId: string) {
    return this.prisma.managementAuditEvent.findMany({
      where: { companyId, objectType, objectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
