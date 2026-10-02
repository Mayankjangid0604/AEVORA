import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RdAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    actorId: string;
    action: string;
    portfolioId?: string;
    objectType?: string;
    objectId?: string;
    oldValue?: any;
    newValue?: any;
  }) {
    return this.prisma.rdAuditEvent.create({ data: params });
  }

  async trail(companyId: string, portfolioId?: string, limit = 100) {
    return this.prisma.rdAuditEvent.findMany({
      where: { companyId, ...(portfolioId ? { portfolioId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
