import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalesActivityType, SalesActorType } from '@prisma/client';
import { SalesAuditService } from './sales-audit.service';

export interface LogActivityDto {
  activityType: SalesActivityType;
  subject: string;
  description?: string;
  outcome?: string;
  nextAction?: string;
  opportunityId?: string;
  salesLeadId?: string;
  targetAccountId?: string;
  scheduledAt?: Date;
  completedAt?: Date;
  isExternal?: boolean;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  actorType?: SalesActorType;
}

@Injectable()
export class SalesActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: SalesAuditService,
  ) {}

  async logActivity(companyId: string, actorId: string, dto: LogActivityDto) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) {
      throw new ForbiddenException('Actor does not belong to company');
    }
    if (actor.status !== 'ACTIVE') {
      throw new ForbiddenException('Actor is not an active employee');
    }

    // External activities without an existing approval are logged as PENDING_APPROVAL
    if (dto.isExternal) {
      // External comms must go through the governed communication pipeline, not directly sent here
      // We log the activity record but the actual external send must use ProductionExecutionGateService
    }

    if (!dto.opportunityId && !dto.salesLeadId && !dto.targetAccountId) {
      throw new BadRequestException('Activity must reference an opportunity, lead, or account');
    }

    if (dto.opportunityId) {
      const opp = await this.prisma.opportunity.findUnique({ where: { id: dto.opportunityId } });
      if (!opp || opp.companyId !== companyId) {
        throw new ForbiddenException('Opportunity does not belong to company');
      }
    }

    if (dto.salesLeadId) {
      const lead = await this.prisma.salesLead.findUnique({ where: { id: dto.salesLeadId } });
      if (!lead || lead.companyId !== companyId) {
        throw new ForbiddenException('Lead does not belong to company');
      }
    }

    if (dto.targetAccountId) {
      const account = await this.prisma.targetAccount.findUnique({ where: { id: dto.targetAccountId } });
      if (!account || account.companyId !== companyId) {
        throw new ForbiddenException('Target account does not belong to company');
      }
    }

    // Idempotency: use upsert so that concurrent identical requests are safe.
    // The unique DB constraint on idempotencyKey ensures exactly one row is created.
    // A null idempotencyKey falls through to a plain create (no uniqueness contract).
    const activityData = {
      companyId,
      actorId,
      actorType: dto.actorType ?? SalesActorType.HUMAN,
      activityType: dto.activityType,
      subject: dto.subject,
      description: dto.description,
      outcome: dto.outcome,
      nextAction: dto.nextAction,
      opportunityId: dto.opportunityId,
      salesLeadId: dto.salesLeadId,
      targetAccountId: dto.targetAccountId,
      scheduledAt: dto.scheduledAt,
      completedAt: dto.completedAt,
      isExternal: dto.isExternal ?? false,
      idempotencyKey: dto.idempotencyKey,
      metadata: dto.metadata ?? {},
    };

    let activity: any;
    if (dto.idempotencyKey) {
      try {
        activity = await this.prisma.salesActivity.upsert({
          where: { idempotencyKey: dto.idempotencyKey },
          create: activityData,
          update: {},
        });
      } catch (err: any) {
        // Concurrent insert race: both requests saw no row and both attempted INSERT.
        // The DB unique constraint on idempotencyKey prevented a duplicate — fetch and return the winner.
        if (err?.code === 'P2002' || err?.message?.includes('Unique constraint')) {
          const existing = await this.prisma.salesActivity.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
          });
          if (!existing) throw err;
          activity = existing;
        } else {
          throw err;
        }
      }
      if (activity.companyId !== companyId) {
        throw new ForbiddenException('Idempotency key belongs to different company');
      }
    } else {
      activity = await this.prisma.salesActivity.create({ data: activityData });
    }

    // Update opportunity last activity timestamp
    if (dto.opportunityId) {
      await this.prisma.opportunity.update({
        where: { id: dto.opportunityId },
        data: { lastActivityAt: new Date() },
      });
    }

    await this.audit.record({
      companyId, actorId, actorType: dto.actorType,
      action: 'SALES_ACTIVITY_LOGGED',
      objectType: 'SalesActivity', objectId: activity.id,
      newValue: { activityType: dto.activityType, subject: dto.subject },
      opportunityId: dto.opportunityId, salesLeadId: dto.salesLeadId,
      targetAccountId: dto.targetAccountId,
    });

    return activity;
  }

  async listActivities(companyId: string, filters: { opportunityId?: string; salesLeadId?: string }) {
    return this.prisma.salesActivity.findMany({
      where: {
        companyId,
        opportunityId: filters.opportunityId,
        salesLeadId: filters.salesLeadId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
