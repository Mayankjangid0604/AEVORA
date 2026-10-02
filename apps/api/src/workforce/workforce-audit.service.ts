import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SENSITIVE_FIELDS = ['password', 'secret', 'token', 'key', 'pin', 'cvv', 'ssn', 'credential', 'apiKey', 'privateKey'];

function sanitize(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = SENSITIVE_FIELDS.some(f => k.toLowerCase().includes(f)) ? '[REDACTED]' : v;
  }
  return result;
}

export interface WorkforceAuditParams {
  companyId: string;
  actorId: string;
  actorType?: string;
  action: string;
  objectType: string;
  objectId: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  outcome?: string;
  reference?: string;
}

@Injectable()
export class WorkforceAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: WorkforceAuditParams): Promise<void> {
    await this.prisma.workforceAuditEvent.create({
      data: {
        companyId: params.companyId,
        actorId: params.actorId,
        actorType: params.actorType ?? 'HUMAN',
        action: params.action,
        objectType: params.objectType,
        objectId: params.objectId,
        oldValue: sanitize(params.oldValue) as any,
        newValue: sanitize(params.newValue) as any,
        outcome: params.outcome ?? 'SUCCESS',
        reference: params.reference,
      },
    });
  }

  async getAuditTrail(companyId: string, objectType: string, objectId: string) {
    return this.prisma.workforceAuditEvent.findMany({
      where: { companyId, objectType, objectId },
      orderBy: { timestamp: 'asc' },
    });
  }

  async getCompanyAudit(companyId: string, limit: number = 100) {
    return this.prisma.workforceAuditEvent.findMany({
      where: { companyId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  }
}
