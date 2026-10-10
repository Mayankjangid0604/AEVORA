import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  EvidenceNature,
  EpistemicCertainty,
  EvidenceVerificationStatus,
  EvidenceRequirement,
  EvidenceContract,
  SubmitEvidenceDto,
  EvidenceVerificationResult,
} from './evidence-contract.types';

/**
 * Deterministic canonical JSON serializer for content hashing.
 */
export function canonicalizeJson(obj: any): string {
  if (obj === undefined) return 'undefined';
  if (obj === null) return 'null';
  if (typeof obj === 'number') {
    if (isNaN(obj) || !isFinite(obj)) {
      throw new Error(`Invalid number in canonicalization: ${obj}`);
    }
    return `n:${obj}`;
  }
  if (typeof obj === 'boolean') return `b:${obj}`;
  if (typeof obj === 'string') return `s:${JSON.stringify(obj)}`;
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(',')}]`;
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).sort();
    const props = keys
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
    return `{${props.join(',')}}`;
  }
  throw new Error(`Unsupported type for canonicalization: ${typeof obj}`);
}

/**
 * Computes deterministic SHA-256 hash of canonicalized JSON.
 */
export function computeContentHash(payload: Record<string, any>): string {
  const canonicalString = canonicalizeJson(payload);
  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

@Injectable()
export class EvidenceVerificationService {
  private readonly logger = new Logger(EvidenceVerificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submits a new evidence record with deterministic hashing and epistemic gating.
   * Guarantees:
   * - Strict company isolation
   * - Task and execution attempt binding
   * - Content hash integrity
   * - Idempotent deduplication (duplicate submissions return existing without inflating confidence)
   * - Epistemic boundaries (AI inferences cannot masquerade as facts)
   * - Append-only corrections (raw historical evidence is never mutated)
   * - Contradiction detection
   */
  async submitEvidence(dto: SubmitEvidenceDto) {
    const {
      companyId,
      taskId,
      attemptId,
      nature = EvidenceNature.RAW,
      evidenceType,
      source,
      sourceType,
      payload,
      integrityMetadata = {},
      confidence = 1.0,
      isIndependent = false,
      isExternal = false,
      effectiveAt,
      expiresAt,
      supersedesId,
      authorityProofId,
      correlationId,
      causationId,
    } = dto;

    if (!companyId) {
      throw new BadRequestException('Evidence submission requires explicit companyId');
    }
    if (!taskId) {
      throw new BadRequestException('Evidence submission requires explicit taskId');
    }

    // 1. Verify Company Isolation on Task
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
    });
    if (!task) {
      throw new NotFoundException(
        `Task ${taskId} not found in company ${companyId}. Cross-company evidence submission rejected.`,
      );
    }

    // 2. Verify Execution Attempt Binding if provided
    if (attemptId) {
      const attempt = await this.prisma.taskExecutionAttempt.findFirst({
        where: { id: attemptId, companyId, taskId },
      });
      if (!attempt) {
        throw new BadRequestException(
          `Execution attempt ${attemptId} does not belong to task ${taskId} in company ${companyId}`,
        );
      }
    }

    // 3. Compute deterministic content hash
    const contentHash = computeContentHash(payload);

    // 4. Idempotency Check: if identical contentHash exists for this company & task, return existing
    const existingSameHash = await this.prisma.taskEvidenceRecord.findFirst({
      where: {
        companyId,
        taskId,
        contentHash,
      },
    });

    if (existingSameHash) {
      this.logger.log(
        `[EvidenceVerification] Idempotent match: Evidence ${existingSameHash.id} already exists with hash ${contentHash}. Skipping duplicate insertion.`,
      );
      return {
        record: existingSameHash,
        isDuplicate: true,
      };
    }

    // 5. Epistemic Certainty Governance
    // AI Inference CANNOT be silently classified as FACT or VERIFIED_FACT
    let finalEpistemicStatus: EpistemicCertainty;
    if (nature === EvidenceNature.AI_INFERENCE) {
      if (
        dto.epistemicStatus === EpistemicCertainty.FACT ||
        dto.epistemicStatus === EpistemicCertainty.VERIFIED_FACT ||
        dto.epistemicStatus === EpistemicCertainty.DERIVED_FACT
      ) {
        this.logger.warn(
          `[EvidenceVerification] Blocked illegal epistemic transition: AI_INFERENCE cannot be submitted as ${dto.epistemicStatus}. Downgrading to INFERENCE.`,
        );
        finalEpistemicStatus = EpistemicCertainty.INFERENCE;
      } else {
        finalEpistemicStatus = dto.epistemicStatus || EpistemicCertainty.INFERENCE;
      }
    } else if (nature === EvidenceNature.DERIVED) {
      finalEpistemicStatus = dto.epistemicStatus || EpistemicCertainty.DERIVED_FACT;
    } else {
      // RAW
      finalEpistemicStatus = dto.epistemicStatus || EpistemicCertainty.UNKNOWN;
    }

    // 6. Append-only supersedes lineage validation
    if (supersedesId) {
      const superseded = await this.prisma.taskEvidenceRecord.findFirst({
        where: { id: supersedesId, companyId, taskId },
      });
      if (!superseded) {
        throw new NotFoundException(
          `Superseded evidence record ${supersedesId} not found for task ${taskId} in company ${companyId}`,
        );
      }
    }

    // 7. Contradiction Detection against existing active evidence
    const existingEvidence = await this.prisma.taskEvidenceRecord.findMany({
      where: {
        companyId,
        taskId,
        verificationStatus: { notIn: [EvidenceVerificationStatus.REJECTED, EvidenceVerificationStatus.EXPIRED] },
      },
    });

    let isContradictory = false;
    const detectedContradictions: string[] = [];

    for (const prev of existingEvidence) {
      if (prev.id === supersedesId) continue; // Superseded records are replaced, not contradictory

      // Check for direct outcome contradictions in payloads
      const prevP = prev.payload as Record<string, any>;
      const currP = payload as Record<string, any>;

      // Key flag contradictions
      if (
        typeof prevP?.success === 'boolean' &&
        typeof currP?.success === 'boolean' &&
        prevP.success !== currP.success
      ) {
        isContradictory = true;
        detectedContradictions.push(
          `Conflicting success flag: previous evidence ${prev.id} had success=${prevP.success}, but new evidence has success=${currP.success}`,
        );
      }

      if (
        prevP?.status &&
        currP?.status &&
        typeof prevP.status === 'string' &&
        typeof currP.status === 'string'
      ) {
        const opposingStatuses = [
          ['DELIVERED', 'BOUNCED'],
          ['CONFIRMED', 'CANCELLED'],
          ['ACCEPTED', 'REJECTED'],
          ['SUCCESS', 'FAILED'],
        ];
        for (const [s1, s2] of opposingStatuses) {
          if (
            (prevP.status.toUpperCase() === s1 && currP.status.toUpperCase() === s2) ||
            (prevP.status.toUpperCase() === s2 && currP.status.toUpperCase() === s1)
          ) {
            isContradictory = true;
            detectedContradictions.push(
              `Conflicting outcome status: previous evidence ${prev.id} has status='${prevP.status}', new evidence has status='${currP.status}'`,
            );
          }
        }
      }
    }

    let initialVerificationStatus: EvidenceVerificationStatus =
      EvidenceVerificationStatus.UNVERIFIED;
    if (isContradictory) {
      this.logger.warn(
        `[EvidenceVerification] CONTRADICTION DETECTED on task ${taskId}: ${detectedContradictions.join('; ')}`,
      );
      initialVerificationStatus = EvidenceVerificationStatus.CONFLICTED;
      finalEpistemicStatus = EpistemicCertainty.CONFLICTED;

      // Mark the conflicting previous evidence records as CONFLICTED as well, preserving both
      for (const prev of existingEvidence) {
        await this.prisma.taskEvidenceRecord.update({
          where: { id: prev.id },
          data: {
            verificationStatus: EvidenceVerificationStatus.CONFLICTED,
            epistemicStatus: EpistemicCertainty.CONFLICTED,
            verificationNotes: `Contradiction detected with newly submitted evidence`,
          },
        });
      }
    }

    // 8. Create canonical immutable TaskEvidenceRecord
    const record = await this.prisma.taskEvidenceRecord.create({
      data: {
        companyId,
        taskId,
        attemptId: attemptId || null,
        nature,
        epistemicStatus: finalEpistemicStatus,
        verificationStatus: initialVerificationStatus,
        evidenceType,
        source,
        sourceType,
        contentHash,
        payload,
        integrityMetadata,
        confidence: Math.max(0.0, Math.min(1.0, confidence)),
        isIndependent,
        isExternal,
        effectiveAt: effectiveAt || null,
        expiresAt: expiresAt || null,
        supersedesId: supersedesId || null,
        authorityProofId: authorityProofId || null,
        correlationId: correlationId || task.correlationId || null,
        causationId: causationId || task.causationId || null,
        verificationNotes: isContradictory ? detectedContradictions.join(' | ') : null,
      },
    });

    this.logger.log(
      `[EvidenceVerification] Recorded evidence ${record.id} [${nature}] for task ${taskId}, hash=${contentHash.slice(0, 8)}, epistemic=${finalEpistemicStatus}`,
    );

    return {
      record,
      isDuplicate: false,
      contradictions: detectedContradictions,
    };
  }

  /**
   * Verifies all evidence attached to a task against its formal Evidence Contract.
   */
  async verifyEvidenceContract(
    taskId: string,
    companyId: string,
    options?: {
      attemptId?: string;
      customContract?: EvidenceContract;
    },
  ): Promise<EvidenceVerificationResult> {
    if (!companyId) {
      throw new BadRequestException('Evidence contract verification requires explicit companyId');
    }

    // 1. Fetch Task with company isolation
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId },
      include: {
        evidenceRecords: {
          orderBy: { capturedAt: 'asc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in company ${companyId}`);
    }

    // 2. Parse or construct EvidenceContract
    const contract: EvidenceContract =
      options?.customContract || this.extractContractFromTask(task);

    const now = new Date();
    const passedRequirements: string[] = [];
    const failedRequirements: string[] = [];
    const missingRequirements: string[] = [];
    const contradictions: string[] = [];
    const uncertainties: string[] = [];
    const reasons: string[] = [];

    // Filter evidence records for this task and check active status
    const allRecords = task.evidenceRecords || [];

    // Check for any conflicting records
    const conflictedRecords = allRecords.filter(
      (r) =>
        r.verificationStatus === EvidenceVerificationStatus.CONFLICTED ||
        r.epistemicStatus === EpistemicCertainty.CONFLICTED,
    );
    if (conflictedRecords.length > 0) {
      contradictions.push(
        `Task contains ${conflictedRecords.length} conflicted evidence record(s). Resolution or Chairman review required.`,
      );
      reasons.push('Unresolved contradictory evidence present on task');
    }

    // Verify each requirement in contract
    for (const req of contract.requirements) {
      // Find matching candidate records that have not been superseded
      const candidates = allRecords.filter(
        (r) =>
          r.evidenceType === req.evidenceType &&
          !allRecords.some((other) => other.supersedesId === r.id),
      );

      if (candidates.length === 0) {
        missingRequirements.push(
          `Missing required evidence of type '${req.evidenceType}': ${req.description}`,
        );
        continue;
      }

      let requirementPassed = false;
      let failureReason = '';

      for (const candidate of candidates) {
        // Integrity check: verify contentHash matches canonical payload hash
        const recomputedHash = computeContentHash(candidate.payload as Record<string, any>);
        if (recomputedHash !== candidate.contentHash) {
          failedRequirements.push(
            `Integrity check failed for evidence ${candidate.id}: content hash mismatch (tampered payload)`,
          );
          await this.prisma.taskEvidenceRecord.update({
            where: { id: candidate.id },
            data: {
              verificationStatus: EvidenceVerificationStatus.REJECTED,
              verificationNotes: 'Hash integrity check failed: payload does not match contentHash',
            },
          });
          continue;
        }

        // Freshness check: check expiration
        if (candidate.expiresAt && candidate.expiresAt < now) {
          failedRequirements.push(
            `Evidence ${candidate.id} has expired at ${candidate.expiresAt.toISOString()}`,
          );
          await this.prisma.taskEvidenceRecord.update({
            where: { id: candidate.id },
            data: {
              verificationStatus: EvidenceVerificationStatus.EXPIRED,
              verificationNotes: 'Evidence expired',
            },
          });
          continue;
        }

        if (req.maxAgeMs) {
          const ageMs = now.getTime() - new Date(candidate.capturedAt).getTime();
          if (ageMs > req.maxAgeMs) {
            failedRequirements.push(
              `Evidence ${candidate.id} age (${Math.round(ageMs / 1000)}s) exceeds maxAgeMs requirement (${Math.round(req.maxAgeMs / 1000)}s)`,
            );
            continue;
          }
        }

        // Exact Attempt Binding check if requested
        if (
          (req.exactAttemptBinding || contract.strictAttemptBinding) &&
          options?.attemptId
        ) {
          if (candidate.attemptId !== options.attemptId) {
            failureReason = `Evidence ${candidate.id} was produced for attempt ${candidate.attemptId}, not current attempt ${options.attemptId}`;
            continue;
          }
        }

        // Required Nature check
        if (req.requiredNature && candidate.nature !== req.requiredNature) {
          failureReason = `Evidence ${candidate.id} nature '${candidate.nature}' does not satisfy required nature '${req.requiredNature}'`;
          continue;
        }

        // AI Inference Boundary: AI inference alone cannot prove an outcome unless explicitly allowed
        if (
          candidate.nature === EvidenceNature.AI_INFERENCE &&
          !contract.allowInferenceAsOutcomeProof &&
          req.sufficientForOutcomeVerification
        ) {
          failureReason = `AI_INFERENCE evidence ${candidate.id} cannot unilaterally satisfy outcome verification`;
          uncertainties.push(
            `Candidate evidence ${candidate.id} is an AI inference and cannot serve as factual outcome verification without independent proof.`,
          );
          continue;
        }

        // Independence check
        if (
          (req.mustBeIndependent || contract.requireIndependentEvidence) &&
          !candidate.isIndependent
        ) {
          failureReason = `Evidence ${candidate.id} is not independent as required`;
          continue;
        }

        // External check
        if (
          (req.mustBeExternal || contract.requireExternalEvidence) &&
          !candidate.isExternal
        ) {
          failureReason = `Evidence ${candidate.id} does not originate from an external system`;
          continue;
        }

        // Minimum confidence check
        if (req.minConfidence && candidate.confidence < req.minConfidence) {
          failureReason = `Evidence ${candidate.id} confidence ${candidate.confidence} is below required threshold ${req.minConfidence}`;
          uncertainties.push(failureReason);
          continue;
        }

        // If candidate passed all checks for this requirement
        requirementPassed = true;

        // Upgrade verification status to VERIFIED and epistemic status if verified
        let upgradedEpistemic = candidate.epistemicStatus;
        if (candidate.nature === EvidenceNature.RAW) {
          upgradedEpistemic = EpistemicCertainty.VERIFIED_FACT;
        } else if (candidate.nature === EvidenceNature.DERIVED) {
          upgradedEpistemic = EpistemicCertainty.DERIVED_FACT;
        }

        await this.prisma.taskEvidenceRecord.update({
          where: { id: candidate.id },
          data: {
            verificationStatus: EvidenceVerificationStatus.VERIFIED,
            epistemicStatus: upgradedEpistemic,
            verifiedAt: now,
            verifiedBy: 'EVIDENCE_VERIFICATION_ENGINE',
          },
        });

        break;
      }

      if (requirementPassed) {
        passedRequirements.push(req.evidenceType);
      } else {
        failedRequirements.push(
          `Requirement '${req.evidenceType}' failed: ${failureReason || 'No valid evidence met all constraints'}`,
        );
      }
    }

    const totalRequirements = contract.requirements.length;
    const passedCount = passedRequirements.length;
    const confidenceScore =
      totalRequirements > 0 ? parseFloat((passedCount / totalRequirements).toFixed(2)) : 1.0;

    const hasContradictions = contradictions.length > 0;
    const hasFailures = failedRequirements.length > 0 || missingRequirements.length > 0;

    let status: EvidenceVerificationStatus;
    let epistemicStatus: EpistemicCertainty;

    if (hasContradictions) {
      status = EvidenceVerificationStatus.CONFLICTED;
      epistemicStatus = EpistemicCertainty.CONFLICTED;
    } else if (hasFailures) {
      status = EvidenceVerificationStatus.REJECTED;
      epistemicStatus = EpistemicCertainty.UNKNOWN;
    } else if (passedCount === totalRequirements && totalRequirements > 0) {
      status = EvidenceVerificationStatus.VERIFIED;
      epistemicStatus = EpistemicCertainty.VERIFIED_FACT;
    } else {
      status = EvidenceVerificationStatus.UNVERIFIED;
      epistemicStatus = EpistemicCertainty.UNKNOWN;
    }

    const canAcceptTechnicalCompletion =
      !hasContradictions &&
      missingRequirements.filter((r) => r.includes('sufficientForTechnicalCompletion')).length === 0;

    const canAcceptOutcomeVerification =
      !hasContradictions && !hasFailures && status === EvidenceVerificationStatus.VERIFIED;

    return {
      verified: status === EvidenceVerificationStatus.VERIFIED,
      status,
      passedRequirements,
      failedRequirements,
      missingRequirements,
      contradictions,
      uncertainties,
      epistemicStatus,
      confidenceScore,
      canAcceptTechnicalCompletion,
      canAcceptOutcomeVerification,
      recheckRequired: hasContradictions || uncertainties.length > 0,
      reasons,
    };
  }

  /**
   * Helper to extract or construct a formal EvidenceContract from Task fields.
   */
  private extractContractFromTask(task: any): EvidenceContract {
    const rawReqs = (task.evidenceRequirements as any[]) || [];
    const requirements: EvidenceRequirement[] = [];

    if (Array.isArray(rawReqs) && rawReqs.length > 0) {
      for (const item of rawReqs) {
        if (typeof item === 'string') {
          requirements.push({
            evidenceType: item,
            description: `Required evidence: ${item}`,
            requiredNature: EvidenceNature.RAW,
            sufficientForOutcomeVerification: true,
          });
        } else if (typeof item === 'object' && item.evidenceType) {
          requirements.push({
            evidenceType: item.evidenceType,
            description: item.description || item.evidenceType,
            requiredNature: item.requiredNature || EvidenceNature.RAW,
            minConfidence: item.minConfidence,
            maxAgeMs: item.maxAgeMs,
            mustBeIndependent: item.mustBeIndependent,
            mustBeExternal: item.mustBeExternal,
            exactAttemptBinding: item.exactAttemptBinding,
            sufficientForTechnicalCompletion: item.sufficientForTechnicalCompletion ?? true,
            sufficientForOutcomeVerification: item.sufficientForOutcomeVerification ?? true,
          });
        }
      }
    }

    return {
      taskId: task.id,
      companyId: task.companyId,
      requirements,
      strictAttemptBinding: false,
      requireIndependentEvidence: false,
      requireExternalEvidence: false,
      allowInferenceAsOutcomeProof: false,
    };
  }
}
