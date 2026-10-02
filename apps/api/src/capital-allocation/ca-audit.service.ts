import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CaAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    actorId: string;
    poolId?: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: any;
    newValue?: any;
  }) {
    return this.prisma.caAuditEvent.create({ data: params });
  }

  async trail(companyId: string, poolId?: string) {
    return this.prisma.caAuditEvent.findMany({
      where: { companyId, ...(poolId ? { poolId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
}
