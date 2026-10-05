import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MarketingAuditService } from './marketing-audit.service';
import { MarketingActorType } from '@prisma/client';

export interface CreatePersonaDto {
  name: string;
  segment?: string;
  description?: string;
  painPoints?: string[];
  needs?: string[];
  objections?: string[];
  interests?: string[];
  buyingContext?: string;
  demographicNotes?: string;
  generatedByAI?: boolean;
  aiModelId?: string;
}

export interface CreateResearchDto {
  title: string;
  researchType: string;
  findings?: Record<string, any>;
  observedFacts?: string[];
  inferences?: string[];
  recommendations?: string[];
  sources?: string[];
  generatedByAI?: boolean;
  aiModelId?: string;
}

@Injectable()
export class MarketResearchService {
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

  async createPersona(companyId: string, actorId: string, dto: CreatePersonaDto) {
    await this.verifyActor(actorId, companyId);
    const persona = await this.prisma.marketPersona.create({
      data: {
        companyId,
        name: dto.name,
        segment: dto.segment,
        description: dto.description,
        painPoints: dto.painPoints ?? [],
        needs: dto.needs ?? [],
        objections: dto.objections ?? [],
        interests: dto.interests ?? [],
        buyingContext: dto.buyingContext,
        demographicNotes: dto.demographicNotes,
        generatedByAI: dto.generatedByAI ?? false,
        aiModelId: dto.aiModelId,
        createdById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'PERSONA_CREATED',
      objectType: 'MarketPersona', objectId: persona.id,
      newValue: { name: dto.name, generatedByAI: dto.generatedByAI },
    });
    return persona;
  }

  async getPersonas(companyId: string) {
    return this.prisma.marketPersona.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPersona(companyId: string, personaId: string) {
    const p = await this.prisma.marketPersona.findUnique({ where: { id: personaId } });
    if (!p || p.companyId !== companyId) throw new NotFoundException('Persona not found');
    return p;
  }

  async createResearch(companyId: string, actorId: string, dto: CreateResearchDto) {
    await this.verifyActor(actorId, companyId);
    const research = await this.prisma.marketResearch.create({
      data: {
        companyId,
        title: dto.title,
        researchType: dto.researchType,
        findings: dto.findings ?? {},
        observedFacts: dto.observedFacts ?? [],
        inferences: dto.inferences ?? [],
        recommendations: dto.recommendations ?? [],
        sources: dto.sources ?? [],
        generatedByAI: dto.generatedByAI ?? false,
        aiModelId: dto.aiModelId,
        aiGeneratedAt: dto.generatedByAI ? new Date() : undefined,
        researchedById: actorId,
      },
    });
    await this.audit.record({
      companyId, actorId, action: 'MARKET_RESEARCH_CREATED',
      objectType: 'MarketResearch', objectId: research.id,
      newValue: { title: dto.title, researchType: dto.researchType },
      actorType: dto.generatedByAI ? MarketingActorType.AI_AGENT : MarketingActorType.HUMAN,
    });
    return research;
  }

  async getResearch(companyId: string) {
    return this.prisma.marketResearch.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getResearchById(companyId: string, id: string) {
    const r = await this.prisma.marketResearch.findUnique({ where: { id } });
    if (!r || r.companyId !== companyId) throw new NotFoundException('Research not found');
    return r;
  }
}
