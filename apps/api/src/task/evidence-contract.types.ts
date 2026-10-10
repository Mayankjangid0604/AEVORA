import {
  EvidenceNature,
  EpistemicCertainty,
  EvidenceVerificationStatus,
  OutcomeVerificationStatus,
} from '@prisma/client';

export {
  EvidenceNature,
  EpistemicCertainty,
  EvidenceVerificationStatus,
  OutcomeVerificationStatus,
};

/**
 * Formal specification for an individual evidence item required by a task.
 */
export interface EvidenceRequirement {
  evidenceType: string; // e.g. "API_RESPONSE", "EXTERNAL_RECEIPT", "DB_RECORD", "SYSTEM_LOG", "OFFER_PURCHASE"
  description: string;
  requiredNature?: EvidenceNature; // e.g. RAW vs DERIVED (AI_INFERENCE can never unilaterally prove outcome)
  minConfidence?: number; // Minimum acceptable confidence (0.0 - 1.0)
  maxAgeMs?: number; // Freshness requirement in milliseconds
  mustBeIndependent?: boolean; // Must be produced by external observer / independent system
  mustBeExternal?: boolean; // Must come from external system (e.g., Gateway or 3rd party API)
  exactAttemptBinding?: boolean; // Must correspond to the exact execution attempt ID
  verificationMethod?:
    | 'DETERMINISTIC_HASH'
    | 'EXTERNAL_PROBE'
    | 'AUDIT_TRAIL'
    | 'CHAIRMAN_AFFIRMATION'
    | 'AUTOMATED_RULE';
  sufficientForTechnicalCompletion?: boolean;
  sufficientForOutcomeVerification?: boolean;
}

/**
 * Formal Evidence Contract attached to a Task.
 */
export interface EvidenceContract {
  taskId: string;
  companyId: string;
  requirements: EvidenceRequirement[];
  strictAttemptBinding?: boolean;
  requireIndependentEvidence?: boolean;
  requireExternalEvidence?: boolean;
  allowInferenceAsOutcomeProof?: boolean; // Defaults to false
}

/**
 * DTO for submitting evidence.
 */
export interface SubmitEvidenceDto {
  companyId: string;
  taskId: string;
  attemptId?: string;
  nature?: EvidenceNature; // default RAW
  epistemicStatus?: EpistemicCertainty; // default UNKNOWN or INFERENCE
  evidenceType: string;
  source: string;
  sourceType: string;
  payload: Record<string, any>;
  integrityMetadata?: Record<string, any>;
  confidence?: number;
  isIndependent?: boolean;
  isExternal?: boolean;
  effectiveAt?: Date;
  expiresAt?: Date;
  supersedesId?: string;
  authorityProofId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Comprehensive result of validating submitted evidence against an evidence contract.
 */
export interface EvidenceVerificationResult {
  verified: boolean;
  status: EvidenceVerificationStatus;
  passedRequirements: string[];
  failedRequirements: string[];
  missingRequirements: string[];
  contradictions: string[];
  uncertainties: string[];
  epistemicStatus: EpistemicCertainty;
  confidenceScore: number;
  canAcceptTechnicalCompletion: boolean;
  canAcceptOutcomeVerification: boolean;
  recheckRequired: boolean;
  reasons: string[];
}

/**
 * Canonical outcome verification evaluation.
 */
export interface OutcomeEvaluationResult {
  taskId: string;
  companyId: string;
  outcomeState: OutcomeVerificationStatus;
  epistemicStatus: EpistemicCertainty;
  verificationScore: number;
  outcomeConfidence: number;
  evidenceResult: EvidenceVerificationResult;
  isOutcomeVerified: boolean;
  falseSuccessPrevented: boolean;
  rejectionReason?: string;
  contractViolations?: string[];
}

/**
 * Strategic reconciliation evaluating observed outcome vs strategic expectations.
 */
export interface StrategicReconciliationResult {
  taskId: string;
  companyId: string;
  goalId?: string;
  projectId?: string;
  expectedOutcome: string;
  observedOutcome: string;
  variance: string;
  evidenceConfidence: number;
  outcomeConfidence: number;
  strategicImpact: 'ON_TRACK' | 'DEVIATION_TOLERABLE' | 'DEVIATION_CRITICAL' | 'INVALIDATING';
  assumptionsValid: boolean;
  replanningRequired: boolean;
  escalationRequired: boolean;
  downstreamImpact: {
    affectedTaskIds: string[];
    affectedGoalIds: string[];
    recommendation: string;
  };
}
