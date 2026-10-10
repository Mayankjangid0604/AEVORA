import { ExecutionEnvironment } from '@prisma/client';
import { ReversibilityLevel, ConsequenceSeverity, StructuredConsequenceReport } from '../ceo/ceo-consequence.types';

/**
 * AEVORA V16 Slice 4 — Four-Tier Risk & External Action Gateway Types
 * Deterministic risk tiers, action contracts, authority verification,
 * secondary safeguards, and audit models.
 */

export type GatewayRiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ExternalActionType =
  | 'SEND_EMAIL'
  | 'SALES_OUTREACH'
  | 'CUSTOMER_COMMUNICATION'
  | 'DISPATCH_OFFER'
  | 'APPLY_DISCOUNT'
  | 'MARKETING_CAMPAIGN'
  | 'AUTHORIZE_PAYMENT'
  | 'TRANSFER_FUNDS'
  | 'EXECUTE_REFUND'
  | 'EXTERNAL_API_CALL'
  | 'VENDOR_COMMITMENT'
  | 'TERMINATE_SERVICE'
  | 'GRANT_AUTHORITY'      // Prohibited self-authorization target
  | 'MODIFY_OWNERSHIP'     // Prohibited equity/ownership target
  | 'IT_REMEDIATION_ACTION';

export type ExecutionState =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'COOLDOWN_ACTIVE'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'UNKNOWN'              // Uncertain provider execution state (requires reconciliation)
  | 'REJECTED';

export type CommunicationIntent =
  | 'INFORMATIONAL'
  | 'OPERATIONAL'
  | 'PROMOTIONAL'
  | 'FINANCIALLY_CONSEQUENTIAL'
  | 'COMPLIANCE_SENSITIVE'
  | 'REPUTATION_SENSITIVE';

export interface ActionTarget {
  targetType: 'CUSTOMER' | 'LEAD' | 'VENDOR' | 'BANK' | 'EXTERNAL_API' | 'OFFER' | 'CAMPAIGN' | 'EMPLOYEE' | 'SYSTEM';
  targetId?: string;
  targetRecipient?: string; // email, webhook URL, account ID
  verifiedInDatabase?: boolean;
}

export interface CriticalSecondarySafeguards {
  requiresSecondaryConfirmation: boolean;
  secondaryConfirmationCode?: string;
  confirmedBy?: string;
  confirmedAt?: Date;
  cooldownPeriodMs: number;
  cooldownExpiresAt?: Date;
  targetVerified: boolean;
  amountVerified: boolean;
  antiReplayToken: string;
}

export interface ExternalActionRequest {
  actionId?: string;
  idempotencyKey: string;
  companyId: string;
  requestingActorId: string;
  requestingActorRole: 'CHAIRMAN' | 'CEO' | 'MANAGEMENT' | 'EMPLOYEE' | 'SYSTEM';
  ceoId?: string;
  actionType: ExternalActionType;
  target: ActionTarget;
  intendedEffect: string;
  payload: Record<string, any>;
  financialExposure: number; // in smallest currency unit / AC
  customerImpact?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  workforceImpact?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  strategicImpact?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  communicationIntent?: CommunicationIntent;
  reversibility: ReversibilityLevel;
  consequenceReport?: StructuredConsequenceReport;
  approvalId?: string;
  secondarySafeguards?: Partial<CriticalSecondarySafeguards>;
  environment?: ExecutionEnvironment;
}

export interface ValidatedActionContext {
  actionId: string;
  idempotencyKey: string;
  companyId: string;
  requestingActorId: string;
  requestingActorRole: string;
  ceoId?: string;
  actionType: ExternalActionType;
  target: ActionTarget;
  intendedEffect: string;
  sanitizedPayload: Record<string, any>;
  financialExposure: number;
  riskTier: GatewayRiskTier;
  reversibility: ReversibilityLevel;
  consequenceSeverity: ConsequenceSeverity;
  isAutonomousPermitted: boolean;
  requiresChairmanApproval: boolean;
  requiresSecondarySafeguards: boolean;
  approvalId?: string;
  approvalConsumed: boolean;
  environment: ExecutionEnvironment;
  evaluatedAt: Date;
}

export interface ExternalActionResult {
  actionId: string;
  idempotencyKey: string;
  companyId: string;
  executionState: ExecutionState;
  success: boolean;
  externalReferenceId?: string;
  provider: string;
  resultPayload?: any;
  errorMessage?: string;
  executedAt: Date;
  isReplayed: boolean;
}

export interface ExternalActionStatusCheck {
  externalReferenceId: string;
  status: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'UNKNOWN';
  rawResponse?: any;
  verifiedAt: Date;
}

export interface ExternalActionAuditRecord {
  id: string;
  actionId: string;
  idempotencyKey: string;
  companyId: string;
  actorId: string;
  actorRole: string;
  actionType: ExternalActionType;
  targetType: string;
  targetRecipient?: string;
  financialExposure: number;
  riskTier: GatewayRiskTier;
  reversibility: ReversibilityLevel;
  consequenceSeverity?: ConsequenceSeverity;
  authorityEvaluation: {
    withinAuthority: boolean;
    reason: string;
    singleLimit?: number;
  };
  approvalId?: string;
  approverId?: string;
  safeguardsApplied: {
    twoStepConfirmed: boolean;
    cooldownAppliedMs: number;
    amountVerified: boolean;
    antiReplayChecked: boolean;
  };
  executionState: ExecutionState;
  externalProvider?: string;
  externalReferenceId?: string;
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface GatewayApprovalPreparation {
  requestId: string;
  companyId: string;
  requesterId: string;
  actionType: ExternalActionType;
  riskTier: GatewayRiskTier;
  target: ActionTarget;
  financialExposure: number;
  intendedEffect: string;
  reversibility: ReversibilityLevel;
  consequenceSummary: {
    overallSeverity: ConsequenceSeverity;
    positiveConsequences: string[];
    negativeConsequences: string[];
    recommendedMitigation: string[];
  };
  evidence: Record<string, any>;
  expiresAt: Date;
  status: 'PENDING_CHAIRMAN_APPROVAL';
}
