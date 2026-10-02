import {
  Injectable, ForbiddenException, NotFoundException, 
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';

export interface CreateBrandProfileDto {
  brandName: string;
  positioning?: string;
  mission?: string;
  valueProposition?: string;
  targetAudience?: string;
  tone?: string;
  voice?: string;
  approvedMessaging?: string[];
  prohibitedMessaging?: string[];
  visualIdentityRef?: string;
}

export interface UpdateBrandProfileDto {
  brandName?: string;
  positioning?: string;
  mission?: string;
  valueProposition?: string;
  targetAudience?: string;
  tone?: string;
  voice?: string;
  approvedMessaging?: string[];
  prohibitedMessaging?: string[];
  visualIdentityRef?: string;
}

export interface CreateBrandGuidelineDto {
  category: string;
  title: string;
  body: string;
  channelScope?: string;
}

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: MarketingAuditService,
  ) {}

  private async verifyActor(actorId: string, companyId: string) {
    const actor = await this.prisma.employee.findUnique({ where: { id: actorId } });
    if (!actor || actor.companyId !== companyId) throw new ForbiddenException('Actor does not belong to company');
    if (actor.status !== 'ACTIVE') throw new ForbiddenException('Actor is not an active employee');
    return actor;
  }

  async upsertBrandProfile(companyId: string, actorId: string, dto: CreateBrandProfileDto) {
    await this.verifyActor(actorId, companyId);
    const existing = await this.prisma.brandProfile.findUnique({ where: { companyId } });
    let profile: any;
    if (existing) {
      profile = await this.prisma.brandProfile.update({
        where: { companyId },
        data: {
          brandName: dto.brandName,
          positioning: dto.positioning,
          mission: dto.mission,
          valueProposition: dto.valueProposition,
          targetAudience: dto.targetAudience,
          tone: dto.tone,
          voice: dto.voice,
          approvedMessaging: dto.approvedMessaging ?? existing.approvedMessaging,
          prohibitedMessaging: dto.prohibitedMessaging ?? existing.prohibitedMessaging,
          visualIdentityRef: dto.visualIdentityRef,
          updatedById: actorId,
          version: { increment: 1 },
        },
      });
    } else {
      profile = await this.prisma.brandProfile.create({
        data: {
          companyId,
          brandName: dto.brandName,
          positioning: dto.positioning,
          mission: dto.mission,
          valueProposition: dto.valueProposition,
          targetAudience: dto.targetAudience,
          tone: dto.tone,
          voice: dto.voice,
          approvedMessaging: dto.approvedMessaging ?? [],
          prohibitedMessaging: dto.prohibitedMessaging ?? [],
          visualIdentityRef: dto.visualIdentityRef,
          createdById: actorId,
          updatedById: actorId,
        },
      });
    }

    await this.audit.record({
      companyId, actorId, action: existing ? 'BRAND_PROFILE_UPDATED' : 'BRAND_PROFILE_CREATED',
      objectType: 'BrandProfile', objectId: profile.id,
      newValue: { brandName: profile.brandName, version: profile.version },
    });
    return profile;
  }

  async getBrandProfile(companyId: string) {
    const profile = await this.prisma.brandProfile.findUnique({
      where: { companyId },
      include: { guidelines: { where: { isActive: true } } },
    });
    return profile ?? null;
  }

  async createGuideline(companyId: string, actorId: string, dto: CreateBrandGuidelineDto) {
    await this.verifyActor(actorId, companyId);
    const profile = await this.prisma.brandProfile.findUnique({ where: { companyId } });
    if (!profile) throw new NotFoundException('Brand profile must be created first');

    const guideline = await this.prisma.brandGuideline.create({
      data: {
        companyId,
        brandProfileId: profile.id,
        category: dto.category,
        title: dto.title,
        body: dto.body,
        channelScope: dto.channelScope as any,
        createdById: actorId,
      },
    });

    await this.audit.record({
      companyId, actorId, action: 'BRAND_GUIDELINE_CREATED',
      objectType: 'BrandGuideline', objectId: guideline.id,
      newValue: { category: dto.category, title: dto.title },
    });
    return guideline;
  }

  async getGuidelines(companyId: string) {
    const profile = await this.prisma.brandProfile.findUnique({ where: { companyId } });
    if (!profile) return [];
    return this.prisma.brandGuideline.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
