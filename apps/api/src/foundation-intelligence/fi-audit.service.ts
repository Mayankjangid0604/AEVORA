import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FiAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    actorId: string;
    datasetId?: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: any;
    newValue?: any;
  }) {
    return this.prisma.fiAuditEvent.create({ data: params });
  }

  async trail(companyId: string, datasetId?: string) {
    return this.prisma.fiAuditEvent.findMany({
      where: { companyId, ...(datasetId ? { datasetId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
