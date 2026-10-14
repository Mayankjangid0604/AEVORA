/**
 * AEVORA V19 — Development & Delivery Factory Types & Enums
 */

export enum ProjectComplexity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  ENTERPRISE = 'ENTERPRISE',
}

export enum DevelopmentToolTarget {
  ANTIGRAVITY = 'ANTIGRAVITY',
  CLAUDE_CODE = 'CLAUDE_CODE',
  LOCAL_CODE = 'LOCAL_CODE',
  HYBRID = 'HYBRID',
}

export enum ToolExecutionMode {
  AUTOMATED = 'AUTOMATED',
  OPERATOR_ASSISTED = 'OPERATOR_ASSISTED',
  MANUAL_FALLBACK = 'MANUAL_FALLBACK',
}

export enum WorkspaceLifecycleStatus {
  UNINITIALIZED = 'UNINITIALIZED',
  ALLOCATED = 'ALLOCATED',
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
  PRESERVED = 'PRESERVED',
  ARCHIVED = 'ARCHIVED',
  CLEANED = 'CLEANED',
}

export enum DeploymentEnvironment {
  PREVIEW = 'PREVIEW',
  PRODUCTION = 'PRODUCTION',
}

export enum DeploymentProviderType {
  VERCEL_MOCK = 'VERCEL_MOCK',
  VERCEL_LIVE = 'VERCEL_LIVE',
  LOCAL_PREVIEW = 'LOCAL_PREVIEW',
}

export enum QualityGateStatus {
  PASSED = 'PASSED',
  FAILED = 'FAILED',
  BLOCKED = 'BLOCKED',
  SKIPPED = 'SKIPPED',
}

export enum HandoverStatus {
  PENDING = 'PENDING',
  PREPARED = 'PREPARED',
  TRANSFERRED = 'TRANSFERRED',
  REJECTED = 'REJECTED',
}

export enum CleanupSafetyDecision {
  ELIGIBLE = 'ELIGIBLE',
  INELIGIBLE = 'INELIGIBLE',
}

export interface ProjectIntakeDto {
  companyId: string;
  clientId: string;
  opportunityId?: string;
  proposalId?: string;
  name: string;
  description: string;
  projectType?: 'WEBSITE' | 'SAAS' | 'MOBILE_APP' | 'NODE' | 'CUSTOM';
  rawRequirements?: string[];
  budgetPaise?: number;
  targetDeadline?: Date | string;
}

export interface StructuredRequirement {
  title: string;
  description: string;
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
  category: 'FUNCTIONAL' | 'NON_FUNCTIONAL' | 'SECURITY' | 'INTEGRATION';
  acceptanceCriteria: string[];
  technicalSpecs?: string[];
}

export interface ScopeBudgetAssessmentResult {
  complexity: ProjectComplexity;
  complexityScore: number;
  estimatedEffortHours: number;
  estimatedCostPaise: number;
  recommendedQuotedPricePaise: number;
  projectedMarginPercent: number;
  scheduleSlippageRiskScore: number;
  risksIdentified: Array<{
    title: string;
    description: string;
    probability: number;
    impact: number;
    severity: number;
    mitigation: string;
  }>;
}

export interface ToolRoutingDecision {
  tool: DevelopmentToolTarget;
  mode: ToolExecutionMode;
  rationale: string;
  maxBudgetPaise: number;
  timeoutMs: number;
  maxRetries: number;
  requiresOperatorReview: boolean;
  capabilitiesRequired: string[];
}

export interface WorkspaceDescriptor {
  projectId: string;
  companyId: string;
  localPath: string;
  status: WorkspaceLifecycleStatus;
  hasLocalGit: boolean;
  gitBranch?: string;
  allocatedAt: Date;
  lastActiveAt: Date;
  preservedArtifactPath?: string;
  archivedAt?: Date;
  cleanedAt?: Date;
}

export interface QualityGateEvaluation {
  id: string;
  projectId: string;
  buildId: string;
  overallStatus: QualityGateStatus;
  score: number;
  evidenceHash: string;
  evaluatedAt: Date;
  checks: {
    dependencyValidation: { passed: boolean; details: string };
    buildVerification: { passed: boolean; artifactPath?: string; details: string };
    lintVerification: { passed: boolean; details: string };
    typeCheckVerification: { passed: boolean; details: string };
    testVerification: { passed: boolean; passedCount: number; failedCount: number; details: string };
    securityVerification: { passed: boolean; secretsDetected: number; details: string };
    requirementsCoverage: { passed: boolean; coveragePercent: number; details: string };
  };
  blockers: string[];
}

export interface DeploymentRecord {
  id: string;
  projectId: string;
  environment: DeploymentEnvironment;
  provider: DeploymentProviderType;
  deploymentUrl: string;
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  healthProbeResponseMs: number;
  authorizedById: string;
  rollbackPlan: {
    previousDeploymentUrl?: string;
    previousArtifactPath?: string;
    rollbackProcedure: string[];
  };
  deployedAt: Date;
}

export interface HandoverPackage {
  id: string;
  projectId: string;
  clientId: string;
  status: HandoverStatus;
  packageSummary: string;
  sourceLocation: string;
  artifactPath: string;
  deploymentUrl?: string;
  testEvidenceSummary: string;
  documentationInstructions: string;
  knownLimitations: string[];
  preparedAt: Date;
  transferredAt?: Date;
  acceptedAt?: Date;
}

export interface CleanupSafetyCheckResult {
  decision: CleanupSafetyDecision;
  reasons: string[];
  blockers: string[];
  checks: {
    projectCompletedOrCancelled: boolean;
    deliveryAccepted: boolean;
    artifactsPreserved: boolean;
    retentionPolicySatisfied: boolean;
    canonicalDirectoryValid: boolean;
    noUnpreservedModifications: boolean;
  };
  reclaimableBytes: number;
}
