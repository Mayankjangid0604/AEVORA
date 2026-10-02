import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AeAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    companyId: string;
    actorId: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: any;
    newValue?: any;
  }) {
    return this.prisma.aeAuditEvent.create({ data: params });
  }

  async trail(companyId: string, limit = 100) {
    return this.prisma.aeAuditEvent.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
