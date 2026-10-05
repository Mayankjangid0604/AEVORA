import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    actorId: string;
    regionId?: string;
    entityId?: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: any;
    newValue?: any;
  }) {
    return this.prisma.goAuditEvent.create({ data: params });
  }

  async trail(companyId: string, regionId?: string, limit = 100) {
    return this.prisma.goAuditEvent.findMany({
      where: { companyId, ...(regionId ? { regionId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
