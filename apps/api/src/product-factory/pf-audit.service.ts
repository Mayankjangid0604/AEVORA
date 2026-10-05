import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PfAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: {
    companyId: string;
    actorId: string;
    productId?: string;
    action: string;
    objectType?: string;
    objectId?: string;
    oldValue?: unknown;
    newValue?: unknown;
  }) {
    return this.prisma.pfProductAuditEvent.create({
      data: {
        companyId: event.companyId,
        actorId: event.actorId,
        productId: event.productId,
        action: event.action,
        objectType: event.objectType,
        objectId: event.objectId,
        oldValue: event.oldValue !== undefined ? (event.oldValue as any) : undefined,
        newValue: event.newValue !== undefined ? (event.newValue as any) : undefined,
      },
    });
  }

  async trail(companyId: string, productId?: string, limit = 100) {
    return this.prisma.pfProductAuditEvent.findMany({
      where: { companyId, ...(productId ? { productId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
