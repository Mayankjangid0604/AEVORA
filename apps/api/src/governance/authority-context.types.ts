import {
  AuthorityTier,
  AuthorityGrantStatus,
  CeoDecisionRiskLevel,
  EmergencyState,
} from '@prisma/client';

export {
  AuthorityTier,
  AuthorityGrantStatus,
  CeoDecisionRiskLevel,
  EmergencyState,
};

/**
 * Numeric rank for strict hierarchy comparison:
 * Lower number = higher authority.
 * CHAIRMAN (0) > CEO (1) > DEPARTMENT_LEADER (2) > WORKFORCE_AGENT (3) > EPHEMERAL_DELEGATE (4)
 */
export const AUTHORITY_TIER_RANK: Record<AuthorityTier, number> = {
  [AuthorityTier.CHAIRMAN]: 0,
  [AuthorityTier.CEO]: 1,
  [AuthorityTier.DEPARTMENT_LEADER]: 2,
  [AuthorityTier.WORKFORCE_AGENT]: 3,
  [AuthorityTier.EPHEMERAL_DELEGATE]: 4,
};

export const MAX_DELEGATION_DEPTH = 3;

export const RISK_TIER_RANK: Record<CeoDecisionRiskLevel, number> = {
  [CeoDecisionRiskLevel.LOW]: 0,
  [CeoDecisionRiskLevel.MEDIUM]: 1,
  [CeoDecisionRiskLevel.HIGH]: 2,
  [CeoDecisionRiskLevel.CRITICAL]: 3,
};

/**
 * Canonical context carried by every consequential autonomous action.
 */
export interface AuthorityContext {
  companyId: string;
  actorId: string;
  actorRole: string;
  actorTier: AuthorityTier;
  actionType: string;
  targetEntity?: string;
  targetId?: string;
  parameters: Record<string, any>;
  parametersHash?: string;
  grantId?: string;
  authorityGrantId?: string;
  commandId?: string;
  approvalId?: string;
  riskTier: CeoDecisionRiskLevel;
  isEmergencyRecovery?: boolean;
  correlationId?: string;
  causationId?: string;
  timestamp?: Date;
}

/**
 * DTO for issuing a governed authority grant.
 */
export interface CreateAuthorityGrantDto {
  companyId: string;
  granterId: string;
  granterRole: string;
  granterTier: AuthorityTier;
  granteeId: string;
  granteeRole: string;
  granteeTier: AuthorityTier;
  capability: string;
  actionScope: string[];
  resourceScope?: string[];
  maxRiskTier?: CeoDecisionRiskLevel;
  parentGrantId?: string;
  expiresAt?: Date;
  commandId?: string;
  correlationId?: string;
  causationId?: string;
}

/**
 * Result of evaluating authority for an action.
 */
export interface AuthorityEvaluation {
  isAuthorized: boolean;
  actorTier: AuthorityTier;
  grantId?: string;
  proofId?: string;
  proof?: any;
  rejectionReason?: string;
  requiresApproval: boolean;
  approvalConsumed: boolean;
  riskTier: CeoDecisionRiskLevel;
  delegationChain: string[];
  refusalPolicyRule?: string;
  refusalAlternative?: string;
}

/**
 * DTO for recording an AI disagreement consultation.
 */
export interface DisagreementConsultationDto {
  companyId: string;
  chairmanId: string;
  ceoId: string;
  topic: string;
  situation: string;
  chairmanPosition: string;
  ceoPosition: string;
  evidenceIds?: string[];
  alternativesConsidered?: string[];
  councilName?: string;
  councilVotes?: Array<{
    agentId: string;
    vote: string;
    rationale: string;
    expertiseDomain: string;
  }>;
  correlationId?: string;
  causationId?: string;
}

/**
 * DTO for Chairman sovereign resolution of a disagreement.
 */
export interface DisagreementResolutionDto {
  disagreementId: string;
  companyId: string;
  chairmanId: string;
  resolverTier?: AuthorityTier;
  resolutionDecision: string;
  finalCommandId?: string;
  finalCommandText?: string;
}

/**
 * Result of replaying an historical authority proof.
 */
export interface AuthorityProofReplayResult {
  proofId: string;
  originalTimestamp: Date;
  actorId: string;
  actorRole: string;
  actorTier: AuthorityTier;
  actionType: string;
  parametersHash: string;
  isHistoricallyValid: boolean;
  reconstructedChain: string[];
  auditNotes: string[];
  replayedAt: Date;
}
