import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EpistemicCertainty } from '@prisma/client';
import {
  RecordStateObservationDto,
  PointInTimeQueryDto,
  StateLineageNode,
  ConflictType,
  IntegrityFindingType,
} from './enterprise-intelligence.types';

@Injectable()
export class CanonicalEnterpriseStateService {
  private readonly logger = new Logger(CanonicalEnterpriseStateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a canonical enterprise-state observation with strict epistemic validation,
   * monotonic versioning, append-only provenance, and reality/simulation isolation.
   */
  async recordObservation(dto: RecordStateObservationDto) {
    const { companyId, entityType, entityId, stateKey, isSimulation = false } = dto;

    if (!companyId || !entityType || !entityId || !stateKey) {
      throw new BadRequestException('companyId, entityType, entityId, and stateKey are required');
    }

    // 1. Verify Company exists and enforce isolation
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company ${companyId} not found`);
    }

    // 2. Strict Reality vs Simulation Boundary Enforcement (Phase 6.9)
    if (isSimulation && !dto.scenarioId) {
      throw new BadRequestException('Simulation observations MUST be associated with a valid scenarioId');
    }

    // Prevent simulation leakage: an observation with a scenarioId cannot claim to be production reality
    if (!isSimulation && dto.scenarioId) {
      await this.prisma.enterpriseIntegrityFinding.create({
        data: {
          companyId,
          findingType: IntegrityFindingType.SIMULATION_LEAKAGE,
          severity: 'CRITICAL',
          entityType,
          entityId,
          description: `Simulation leakage attempt detected: stateKey ${stateKey} passed scenarioId ${dto.scenarioId} but claimed production reality`,
          details: dto as any,
        },
      });
      throw new BadRequestException('Simulation state cannot be written to production reality');
    }

    // 3. Epistemic Classification Verification (Phase 6.2)
    let epistemicStatus = dto.epistemicStatus || EpistemicCertainty.FACT;
    let confidence = dto.confidence !== undefined ? dto.confidence : 1.0;

    // AI inference must NEVER silently become FACT
    if (dto.sourceType === 'AI_AGENT' && (epistemicStatus === EpistemicCertainty.FACT || epistemicStatus === EpistemicCertainty.VERIFIED_FACT)) {
      this.logger.warn(`[${companyId}] AI_AGENT cannot assert FACT directly. Downgrading to INFERENCE.`);
      epistemicStatus = EpistemicCertainty.INFERENCE;
      confidence = Math.min(confidence, 0.85);
    }

    // VERIFIED_FACT strictly requires verified evidence
    if (epistemicStatus === EpistemicCertainty.VERIFIED_FACT) {
      if (!dto.evidenceRecordId) {
        this.logger.warn(`[${companyId}] VERIFIED_FACT requires evidenceRecordId. Downgrading to INFERENCE.`);
        epistemicStatus = EpistemicCertainty.INFERENCE;
        confidence = Math.min(confidence, 0.7);
      } else {
        const evidence = await this.prisma.taskEvidenceRecord.findUnique({
          where: { id: dto.evidenceRecordId },
        });
        if (!evidence || evidence.verificationStatus !== 'VERIFIED') {
          this.logger.warn(`[${companyId}] Evidence ${dto.evidenceRecordId} is not VERIFIED. Downgrading to INFERENCE.`);
          epistemicStatus = EpistemicCertainty.INFERENCE;
          confidence = Math.min(confidence, 0.75);
        }
      }
    }

    // 4. Find existing current state record to determine version and check for conflicts
    const existingCurrent = await this.prisma.enterpriseStateRecord.findFirst({
      where: {
        companyId,
        entityType,
        entityId,
        stateKey,
        isCurrent: true,
        isSimulation,
        ...(dto.scenarioId ? { scenarioId: dto.scenarioId } : {}),
      },
    });

    let version = 1;
    let supersedesId: string | undefined = undefined;

    if (existingCurrent) {
      version = existingCurrent.version + 1;
      supersedesId = existingCurrent.id;

      // Conflict Detection (Phase 6.6): Check if active state is contradicted by a competing source
      const existingValStr = JSON.stringify(existingCurrent.stateValue);
      const newValStr = JSON.stringify(dto.stateValue);

      if (existingValStr !== newValStr && existingCurrent.source !== dto.source && !existingCurrent.isStale) {
        // Record explicit conflict
        this.logger.warn(`[${companyId}] Contradictory state detected on ${entityType}:${entityId} [${stateKey}] between ${existingCurrent.source} and ${dto.source}`);
        await this.prisma.enterpriseStateConflict.create({
          data: {
            companyId,
            entityType,
            entityId,
            field: stateKey,
            primaryStateId: existingCurrent.id,
            conflictType: ConflictType.CONTRADICTORY_VALUE,
            primarySource: existingCurrent.source,
            primaryValue: existingCurrent.stateValue,
            secondarySource: dto.source,
            secondaryValue: dto.stateValue,
            resolutionStatus: 'OPEN',
            correlationId: dto.correlationId,
            causationId: dto.causationId,
          },
        });
        // Mark both as conflicted
        epistemicStatus = EpistemicCertainty.CONFLICTED;
        await this.prisma.enterpriseStateRecord.update({
          where: { id: existingCurrent.id },
          data: { isConflicted: true, conflictReason: `Contradicted by ${dto.source}` },
        });
      }

      // Mark the prior current record as no longer current (monotonic append-only update)
      await this.prisma.enterpriseStateRecord.update({
        where: { id: existingCurrent.id },
        data: { isCurrent: false },
      });
    }

    // 5. Freshness window calculation
    const observedAt = dto.observedAt || new Date();
    const validFrom = dto.validFrom || observedAt;
    const validUntil = dto.validUntil || (dto.freshnessWindowMs ? new Date(observedAt.getTime() + dto.freshnessWindowMs) : undefined);

    // 6. Create immutable EnterpriseStateRecord
    const record = await this.prisma.enterpriseStateRecord.create({
      data: {
        companyId,
        streamKey: dto.streamKey,
        entityType,
        entityId,
        stateKey,
        stateValue: dto.stateValue,
        version,
        epistemicStatus,
        confidence,
        source: dto.source,
        sourceType: dto.sourceType,
        sourceEventId: dto.sourceEventId,
        evidenceRecordId: dto.evidenceRecordId,
        authorityProofId: dto.authorityProofId,
        attemptId: dto.attemptId,
        observedAt,
        validFrom,
        validUntil,
        freshnessWindowMs: dto.freshnessWindowMs,
        isStale: false,
        isConflicted: epistemicStatus === EpistemicCertainty.CONFLICTED,
        conflictReason: epistemicStatus === EpistemicCertainty.CONFLICTED ? 'Contradictory state detected' : undefined,
        supersedesId,
        isCurrent: true,
        isSimulation,
        scenarioId: dto.scenarioId,
        correlationId: dto.correlationId,
        causationId: dto.causationId,
      },
    });

    this.logger.debug(
      `[${companyId}] Recorded state ${entityType}:${entityId}:${stateKey} v${version} (${epistemicStatus}, conf: ${confidence}, sim: ${isSimulation})`,
    );

    return record;
  }

  /**
   * Retrieves current active state with strict company isolation.
   */
  async getCurrentState(
    companyId: string,
    entityType: string,
    entityId: string,
    stateKey: string,
    includeSimulation = false,
  ) {
    return this.prisma.enterpriseStateRecord.findFirst({
      where: {
        companyId,
        entityType,
        entityId,
        stateKey,
        isCurrent: true,
        isSimulation: includeSimulation,
      },
      include: {
        evidenceRecord: true,
        authorityProof: true,
        attempt: true,
      },
    });
  }

  /**
   * Retrieves all current active states for a company, optionally filtered by streamKey.
   */
  async getAllCurrentStates(companyId: string, streamKey?: string, includeSimulation = false) {
    return this.prisma.enterpriseStateRecord.findMany({
      where: {
        companyId,
        isCurrent: true,
        isSimulation: includeSimulation,
        ...(streamKey ? { streamKey } : {}),
      },
      orderBy: { observedAt: 'desc' },
    });
  }

  /**
   * Reconstructs deterministic point-in-time state as of a historical timestamp.
   */
  async getPointInTimeState(dto: PointInTimeQueryDto) {
    const { companyId, asOf, streamKey, entityType, entityId } = dto;

    // Fetch all historical records observed at or before `asOf`
    const records = await this.prisma.enterpriseStateRecord.findMany({
      where: {
        companyId,
        isSimulation: false,
        observedAt: { lte: asOf },
        ...(streamKey ? { streamKey } : {}),
        ...(entityType ? { entityType } : {}),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: [
        { entityType: 'asc' },
        { entityId: 'asc' },
        { stateKey: 'asc' },
        { version: 'desc' },
      ],
    });

    // Reduce to the most recent record per (entityType, entityId, stateKey) up to `asOf`
    const map = new Map<string, any>();
    for (const record of records) {
      const key = `${record.entityType}:${record.entityId}:${record.stateKey}`;
      if (!map.has(key)) {
        map.set(key, record);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Retrieves full causal and provenance lineage for an enterprise state record.
   */
  async getStateLineage(companyId: string, recordId: string): Promise<StateLineageNode[]> {
    const lineage: StateLineageNode[] = [];
    let currentId: string | null = recordId;

    while (currentId) {
      const record: any = await this.prisma.enterpriseStateRecord.findUnique({
        where: { id: currentId },
        include: {
          evidenceRecord: true,
          authorityProof: true,
          attempt: true,
        },
      });

      if (!record || record.companyId !== companyId) break;

      lineage.push({
        recordId: record.id,
        companyId: record.companyId,
        entityType: record.entityType,
        entityId: record.entityId,
        stateKey: record.stateKey,
        stateValue: record.stateValue,
        version: record.version,
        epistemicStatus: record.epistemicStatus,
        confidence: record.confidence,
        source: record.source,
        observedAt: record.observedAt,
        isCurrent: record.isCurrent,
        isSimulation: record.isSimulation,
        evidenceRecordId: record.evidenceRecordId,
        authorityProofId: record.authorityProofId,
        attemptId: record.attemptId,
        supersedesId: record.supersedesId,
        correlationId: record.correlationId,
        causationId: record.causationId,
        evidenceDetails: record.evidenceRecord,
        authorityDetails: record.authorityProof,
        attemptDetails: record.attempt,
      });

      currentId = record.supersedesId;
    }

    return lineage;
  }

  /**
   * Evaluates state freshness and marks stale records without deleting them.
   */
  async evaluateFreshness(companyId: string): Promise<number> {
    const now = new Date();
    const potentiallyStale = await this.prisma.enterpriseStateRecord.findMany({
      where: {
        companyId,
        isCurrent: true,
        isStale: false,
        validUntil: { lt: now },
      },
    });

    let staleCount = 0;
    for (const record of potentiallyStale) {
      await this.prisma.enterpriseStateRecord.update({
        where: { id: record.id },
        data: {
          isStale: true,
          confidence: Math.max(0.1, record.confidence * 0.5), // Policy-driven confidence decay
          epistemicStatus:
            record.epistemicStatus === EpistemicCertainty.FACT || record.epistemicStatus === EpistemicCertainty.VERIFIED_FACT
              ? EpistemicCertainty.UNKNOWN
              : record.epistemicStatus,
        },
      });
      staleCount++;
    }

    if (staleCount > 0) {
      this.logger.log(`[${companyId}] Marked ${staleCount} records as STALE during freshness reconciliation`);
    }

    return staleCount;
  }
}
