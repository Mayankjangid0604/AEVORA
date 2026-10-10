import { Injectable, Logger, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgMemoryType } from '@prisma/client';
import {
  MemoryCategory,
  MemoryMaturity,
  StructuredMemoryRecord,
  StructuredLesson,
  DetectedPattern,
} from './organizational-memory.types';
import { GatewayAuthorityValidatorService } from '../external-action-gateway/gateway-authority-validator.service';

@Injectable()
export class ExecutiveMemoryService {
  private readonly logger = new Logger(ExecutiveMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorityValidator: GatewayAuthorityValidatorService,
  ) {}

  /**
   * Stores a structured executive memory record into the authoritative database.
   * Sanitizes external text to ensure memory remains inert data, never executable authority.
   */
  async recordMemory(
    companyId: string,
    actorId: string,
    data: {
      category: MemoryCategory;
      subject: string;
      content: string;
      maturity?: MemoryMaturity;
      confidence?: number;
      applicableDomain?: string;
      sourceDecisionId?: string;
      sourceRiskId?: string;
      evidenceReferences?: string[];
      metadata?: Record<string, any>;
    },
  ): Promise<StructuredMemoryRecord> {
    if (!companyId) throw new BadRequestException('companyId is required.');
    if (!data.subject) throw new BadRequestException('Memory subject is required.');
    if (!data.content) throw new BadRequestException('Memory content is required.');

    // Sanitize any untrusted text inside content and metadata to prevent prompt-injection escalation
    const sanitizedMetadata = this.authorityValidator.sanitizePayload(data.metadata || {});
    const cleanContent = data.content.replace(/[\r\n]+/g, ' ').substring(0, 2000);

    const memoryType = this.mapCategoryToPrismaType(data.category);
    const maturity = data.maturity || 'OBSERVATION';
    const confidence = Math.min(100, Math.max(0, data.confidence ?? 50));

    const tagsPayload = {
      category: data.category,
      maturity,
      confidence,
      applicableDomain: data.applicableDomain,
      evidenceReferences: data.evidenceReferences || [],
      metadata: sanitizedMetadata,
    };

    const record = await this.prisma.organizationalMemory.create({
      data: {
        companyId,
        memoryType,
        subject: data.subject,
        content: cleanContent,
        tags: tagsPayload as any,
        sourceDecisionId: data.sourceDecisionId,
        sourceRiskId: data.sourceRiskId,
        recordedBy: actorId,
        relevanceScore: Math.round(confidence),
        isArchived: false,
      },
    });

    return this.mapToStructuredRecord(record);
  }

  /**
   * Records an extracted lesson directly into governed executive memory.
   */
  async recordLesson(actorId: string, lesson: StructuredLesson): Promise<StructuredMemoryRecord> {
    return this.recordMemory(lesson.companyId, actorId, {
      category: 'LESSON',
      subject: `Lesson: ${lesson.observedSituation}`,
      content: `${lesson.actionTaken} -> Result: ${lesson.actualResult}. Root Cause: ${lesson.likelyRootCause}`,
      maturity: lesson.maturity,
      confidence: lesson.confidence,
      applicableDomain: lesson.applicabilityDomain,
      sourceDecisionId: lesson.sourceDecisionId,
      evidenceReferences: lesson.evidenceReferences,
      metadata: {
        varianceSummary: lesson.varianceSummary,
        expectedResult: lesson.expectedResult,
        sourceTaskId: lesson.sourceTaskId,
        sourceOutcomeId: lesson.sourceOutcomeId,
        departmentId: lesson.departmentId,
        workerId: lesson.workerId,
        capability: lesson.capability,
        contradictionCount: lesson.contradictionCount || 0,
        invalidationReason: lesson.invalidationReason,
        supersedesId: lesson.supersedesId,
      },
    });
  }

  /**
   * Records a detected organizational pattern into governed executive memory.
   */
  async recordPattern(actorId: string, pattern: DetectedPattern): Promise<StructuredMemoryRecord> {
    return this.recordMemory(pattern.companyId, actorId, {
      category: 'PATTERN',
      subject: `Pattern: ${pattern.title}`,
      content: pattern.description,
      maturity: pattern.maturity,
      confidence: pattern.confidence,
      evidenceReferences: pattern.supportingDecisionIds.concat(pattern.supportingTaskIds || []),
      metadata: {
        patternSignature: pattern.patternSignature,
        supportingObservationsCount: pattern.supportingObservationsCount,
        supportingTaskIds: pattern.supportingTaskIds || [],
        affectedScope: pattern.affectedScope,
        affectedEntityId: pattern.affectedEntityId,
        contradictionCount: pattern.contradictionCount || 0,
        invalidationReason: pattern.invalidationReason,
        recommendedAction: pattern.recommendedAction,
      },
    });
  }

  /**
   * Updates memory maturity or deprecates stale memory.
   */
  async updateMemoryMaturity(
    companyId: string,
    memoryId: string,
    newMaturity: MemoryMaturity,
    reason?: string,
  ): Promise<StructuredMemoryRecord> {
    const mem = await this.prisma.organizationalMemory.findFirst({
      where: { id: memoryId, companyId },
    });
    if (!mem) {
      throw new NotFoundException(`Memory ${memoryId} not found for company ${companyId}`);
    }

    const tags = (mem.tags as any) || {};
    tags.maturity = newMaturity;
    if (reason) {
      tags.maturityUpdateReason = reason;
      tags.maturityUpdatedAt = new Date().toISOString();
    }

    const isArchived = newMaturity === 'DEPRECATED';

    const updated = await this.prisma.organizationalMemory.update({
      where: { id: memoryId },
      data: {
        tags: tags as any,
        isArchived,
      },
    });

    this.logger.log(`[Memory Governance] Memory ${memoryId} transitioned to ${newMaturity}`);
    return this.mapToStructuredRecord(updated);
  }

  /**
   * Source-of-Truth Rule & Memory Conflict Handling:
   * Compares memory assertions against current authoritative PostgreSQL state.
   * If memory conflicts with authoritative state, the authoritative state wins
   * and the memory is marked DEPRECATED.
   */
  async verifyAndResolveMemoryConflict(
    companyId: string,
    memoryId: string,
    authoritativeCurrentFact: { metric: string; currentValue: any },
  ): Promise<{ hasConflict: boolean; resolution: string; authoritativeValue: any }> {
    const mem = await this.prisma.organizationalMemory.findFirst({
      where: { id: memoryId, companyId },
    });
    if (!mem) throw new NotFoundException(`Memory ${memoryId} not found`);

    const tags = (mem.tags as any) || {};
    const memoryAssertedValue = tags.metadata?.[authoritativeCurrentFact.metric];

    if (memoryAssertedValue !== undefined && memoryAssertedValue !== authoritativeCurrentFact.currentValue) {
      this.logger.warn(
        `[Memory Conflict Surfaced] Memory ${memoryId} asserted ${authoritativeCurrentFact.metric}=${memoryAssertedValue}, but PostgreSQL authoritative state is ${authoritativeCurrentFact.currentValue}. Authoritative state WINS.`,
      );

      // Deprecate stale memory so it is not silently used as truth
      await this.updateMemoryMaturity(
        companyId,
        memoryId,
        'DEPRECATED',
        `Authoritative state conflict: Current ${authoritativeCurrentFact.metric} is ${authoritativeCurrentFact.currentValue}`,
      );

      return {
        hasConflict: true,
        resolution: 'Authoritative state overrode stale memory. Memory marked DEPRECATED.',
        authoritativeValue: authoritativeCurrentFact.currentValue,
      };
    }

    return {
      hasConflict: false,
      resolution: 'Memory is consistent with current authoritative state.',
      authoritativeValue: authoritativeCurrentFact.currentValue,
    };
  }

  /**
   * Deterministic Relevance Filtering for CEO Context Assembly:
   * Returns top relevant memories based on domain, decisionType, recency, maturity, and confidence.
   * Prevents flooding the CEO reasoning context with the entire historical memory database.
   */
  async getRelevantMemoriesForContext(
    companyId: string,
    criteria: {
      domain?: string;
      decisionType?: string;
      category?: MemoryCategory;
      maxResults?: number;
      minConfidence?: number;
    },
  ): Promise<StructuredMemoryRecord[]> {
    const max = criteria.maxResults ?? 5;
    const minConf = criteria.minConfidence ?? 30;

    const rawMemories = await this.prisma.organizationalMemory.findMany({
      where: {
        companyId,
        isArchived: false,
      },
      orderBy: [{ relevanceScore: 'desc' }, { createdAt: 'desc' }],
      take: 50, // Read candidate pool
    });

    const structured = rawMemories.map((m) => this.mapToStructuredRecord(m));

    // Filter and rank deterministically
    const filtered = structured.filter((m) => {
      if (m.confidence < minConf) return false;
      if (m.maturity === 'DEPRECATED') return false;

      if (criteria.category && m.category !== criteria.category) return false;
      if (criteria.domain && m.applicableDomain && m.applicableDomain !== criteria.domain && m.applicableDomain !== 'GENERAL') {
        return false;
      }
      return true;
    });

    // Score relevance dynamically
    filtered.sort((a, b) => {
      let scoreA = a.confidence;
      let scoreB = b.confidence;

      if (a.maturity === 'CONFIRMED') scoreA += 25;
      if (b.maturity === 'CONFIRMED') scoreB += 25;
      if (a.category === 'LESSON' || a.category === 'PATTERN') scoreA += 15;
      if (b.category === 'LESSON' || b.category === 'PATTERN') scoreB += 15;

      return scoreB - scoreA;
    });

    return filtered.slice(0, max);
  }

  /**
   * Retrieves full company-isolated memory audit trail.
   */
  async getCompanyMemories(companyId: string, includeArchived = false): Promise<StructuredMemoryRecord[]> {
    const records = await this.prisma.organizationalMemory.findMany({
      where: {
        companyId,
        ...(includeArchived ? {} : { isArchived: false }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToStructuredRecord(r));
  }

  private mapCategoryToPrismaType(category: MemoryCategory): OrgMemoryType {
    switch (category) {
      case 'SUCCESS':
        return OrgMemoryType.SUCCESSFUL_INTERVENTION;
      case 'FAILURE':
        return OrgMemoryType.FAILED_INTERVENTION;
      case 'RISK':
        return OrgMemoryType.RECURRING_RISK;
      case 'LESSON':
        return OrgMemoryType.LESSON;
      case 'DECISION':
      case 'OUTCOME':
      default:
        return OrgMemoryType.DECISION_OUTCOME;
    }
  }

  private mapToStructuredRecord(record: any): StructuredMemoryRecord {
    const tags = (record.tags as any) || {};
    return {
      id: record.id,
      companyId: record.companyId,
      memoryType: record.memoryType,
      category: tags.category || 'DECISION',
      subject: record.subject,
      content: record.content,
      maturity: tags.maturity || 'OBSERVATION',
      confidence: tags.confidence ?? record.relevanceScore ?? 50,
      relevanceScore: record.relevanceScore ?? 50,
      applicableDomain: tags.applicableDomain,
      sourceDecisionId: record.sourceDecisionId,
      sourceRiskId: record.sourceRiskId,
      evidenceReferences: tags.evidenceReferences || [],
      metadata: tags.metadata || {},
      isArchived: record.isArchived,
      createdAt: record.createdAt,
      updatedAt: record.createdAt,
    };
  }
}
