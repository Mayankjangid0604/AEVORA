import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BuAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: {
    companyId: string; actorId: string; buId?: string;
    action: string; objectType?: string; objectId?: string;
    oldValue?: any; newValue?: any;
  }) {
    return this.prisma.buAuditEvent.create({
      data: {
        companyId: event.companyId,
        buId: event.buId,
        actorId: event.actorId,
        action: event.action,
        objectType: event.objectType,
        objectId: event.objectId,
        oldValue: event.oldValue,
        newValue: event.newValue,
      },
    });
  }

  async trail(companyId: string, buId?: string, limit = 100) {
    return this.prisma.buAuditEvent.findMany({
      where: { companyId, ...(buId ? { buId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
