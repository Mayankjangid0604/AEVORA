import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingActorType } from '@prisma/client';

export interface MarketingAuditParams {
  companyId: string;
  actorId: string;
  actorType?: MarketingActorType;
  action: string;
  objectType: string;
  objectId: string;
  oldValue?: any;
  newValue?: any;
  outcome?: string;
  contentId?: string;
  campaignId?: string;
  correlationId?: string;
}

@Injectable()
export class MarketingAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: MarketingAuditParams): Promise<void> {
    const {
      companyId, actorId, actorType = MarketingActorType.HUMAN,
      action, objectType, objectId,
      oldValue, newValue, outcome = 'SUCCESS',
      contentId, campaignId, correlationId,
    } = params;

    await this.prisma.marketingAuditEvent.create({
      data: {
        companyId, actorId, actorType, action, objectType, objectId,
        oldValue: this.sanitize(oldValue),
        newValue: this.sanitize(newValue),
        outcome, contentId, campaignId, correlationId,
      },
    });
  }

  private sanitize(value: any): any {
    if (value == null) return undefined;
    const forbidden = ['password', 'secret', 'token', 'credential', 'hash', 'salt', 'apikey', 'privatekey'];
    if (typeof value !== 'object') return value;
    const out: any = {};
    for (const k of Object.keys(value)) {
      if (forbidden.some(f => k.toLowerCase().replace(/_/g, '').includes(f))) continue;
      out[k] = value[k];
    }
    return out;
  }
}
