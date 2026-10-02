import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesActorType } from '@prisma/client';

export interface SalesAuditParams {
  companyId: string;
  actorId: string;
  actorType?: SalesActorType;
  action: string;
  objectType: string;
  objectId: string;
  oldValue?: any;
  newValue?: any;
  outcome?: string;
  correlationId?: string;
  opportunityId?: string;
  salesLeadId?: string;
  targetAccountId?: string;
}

@Injectable()
export class SalesAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: SalesAuditParams): Promise<void> {
    const {
      companyId, actorId, actorType = SalesActorType.HUMAN,
      action, objectType, objectId,
      oldValue, newValue, outcome = 'SUCCESS',
      correlationId, opportunityId, salesLeadId, targetAccountId,
    } = params;

    // Never log secrets or sensitive credential fields
    const sanitizedOld = this.sanitize(oldValue);
    const sanitizedNew = this.sanitize(newValue);

    await this.prisma.salesAuditEvent.create({
      data: {
        companyId, actorId, actorType, action, objectType, objectId,
        oldValue: sanitizedOld,
        newValue: sanitizedNew,
        outcome, correlationId, opportunityId, salesLeadId, targetAccountId,
      },
    });
  }

  private sanitize(value: any): any {
    if (value == null) return undefined;
    const forbidden = ['password', 'secret', 'token', 'credential', 'hash', 'salt', 'key'];
    if (typeof value !== 'object') return value;
    const out: any = {};
    for (const k of Object.keys(value)) {
      if (forbidden.some(f => k.toLowerCase().includes(f))) continue;
      out[k] = value[k];
    }
    return out;
  }
}
