/**
 * AEVORA V17 — Phase 6: Enterprise Intelligence & Digital Twin Types
 *
 * Constitutional Principle:
 * REALITY > VERIFIED EVIDENCE > DERIVED STATE > INFERENCE > HYPOTHESIS > SIMULATION
 *
 * Simulation may influence planning, but can NEVER become reality merely because a model predicts it.
 */

import { EpistemicCertainty } from '@prisma/client';

export enum EnterpriseStreamKey {
  ORGANIZATION = 'ORGANIZATION',
  DEPARTMENTS = 'DEPARTMENTS',
  WORKFORCE = 'WORKFORCE',
  PROJECTS = 'PROJECTS',
  TASKS = 'TASKS',
  OUTCOMES = 'OUTCOMES',
  FINANCIAL = 'FINANCIAL',
  OPERATIONAL_HEALTH = 'OPERATIONAL_HEALTH',
  RISK = 'RISK',
  SPATIAL_WORLD = 'SPATIAL_WORLD',
  GOVERNANCE = 'GOVERNANCE',
  EXTERNAL = 'EXTERNAL',
}

export enum EnterpriseEntityType {
  COMPANY = 'COMPANY',
  DEPARTMENT = 'DEPARTMENT',
  EMPLOYEE = 'EMPLOYEE',
  PROJECT = 'PROJECT',
  TASK = 'TASK',
  GOAL = 'GOAL',
  SPATIAL_SITE = 'SPATIAL_SITE',
  SPATIAL_BUILDING = 'SPATIAL_BUILDING',
  SPATIAL_ROOM = 'SPATIAL_ROOM',
  SPATIAL_WORKSPACE = 'SPATIAL_WORKSPACE',
  FINANCIAL_LEDGER = 'FINANCIAL_LEDGER',
}

export enum ConflictType {
  CONTRADICTORY_VALUE = 'CONTRADICTORY_VALUE',
  STALE_VS_FRESH = 'STALE_VS_FRESH',
  SIMULATION_AS_REALITY = 'SIMULATION_AS_REALITY',
  V15_SPATIAL_MISMATCH = 'V15_SPATIAL_MISMATCH',
  COMPETING_OBSERVATIONS = 'COMPETING_OBSERVATIONS',
}

export enum IntegrityFindingType {
  IMPOSSIBLE_DEPENDENCY = 'IMPOSSIBLE_DEPENDENCY',
  MISSING_EVIDENCE_FOR_OUTCOME = 'MISSING_EVIDENCE_FOR_OUTCOME',
  UNAUTHORIZED_ATTEMPT = 'UNAUTHORIZED_ATTEMPT',
  INACTIVE_WORKER_ASSIGNMENT = 'INACTIVE_WORKER_ASSIGNMENT',
  CROSS_COMPANY_REFERENCE = 'CROSS_COMPANY_REFERENCE',
  SIMULATION_LEAKAGE = 'SIMULATION_LEAKAGE',
  V15_SPATIAL_CONTRADICTION = 'V15_SPATIAL_CONTRADICTION',
  ORPHAN_CHILD_STATE = 'ORPHAN_CHILD_STATE',
  FORECAST_DISCREPANCY = 'FORECAST_DISCREPANCY',
}

export enum HealthTier {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  CRITICAL = 'CRITICAL',
}

export interface RecordStateObservationDto {
  companyId: string;
  streamKey: string;
  entityType: string;
  entityId: string;
  stateKey: string;
  stateValue: any;
  epistemicStatus?: EpistemicCertainty;
  confidence?: number;
  source: string;
  sourceType: string;
  sourceEventId?: string;
  evidenceRecordId?: string;
  authorityProofId?: string;
  attemptId?: string;
  observedAt?: Date;
  validFrom?: Date;
  validUntil?: Date;
  freshnessWindowMs?: number;
  isSimulation?: boolean;
  scenarioId?: string;
  correlationId?: string;
  causationId?: string;
}

export interface PointInTimeQueryDto {
  companyId: string;
  asOf: Date;
  streamKey?: string;
  entityType?: string;
  entityId?: string;
}

export interface StateLineageNode {
  recordId: string;
  companyId: string;
  entityType: string;
  entityId: string;
  stateKey: string;
  stateValue: any;
  version: number;
  epistemicStatus: EpistemicCertainty;
  confidence: number;
  source: string;
  observedAt: Date;
  isCurrent: boolean;
  isSimulation: boolean;
  evidenceRecordId?: string | null;
  authorityProofId?: string | null;
  attemptId?: string | null;
  supersedesId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  evidenceDetails?: any;
  authorityDetails?: any;
  attemptDetails?: any;
}

export interface CreateScenarioDto {
  companyId: string;
  name: string;
  description?: string;
  assumptions?: any[];
  hypotheticalChanges: any[];
  createdBy: string;
  expiresAt?: Date;
  correlationId?: string;
  causationId?: string;
}

export interface ScenarioSimulationResult {
  scenarioId: string;
  companyId: string;
  status: string;
  projectedOutcomes: any[];
  consequenceReport: any;
  confidenceScore: number;
  uncertaintyNotes?: string;
  simulatedStatesCount: number;
}

export interface ReconciliationResult {
  reconciledCount: number;
  conflictsDetected: number;
  integrityFindingsDetected: number;
  replanningTriggered: boolean;
  errors: string[];
}

export interface ReplanningEvaluationResult {
  replanningRequired: boolean;
  isThrottled: boolean;
  deduplicationKey: string;
  reason?: string;
  planChangeRecordId?: string;
  modifications?: any[];
}

export enum ScenarioBranchType {
  PROPOSED = 'PROPOSED',
  ALTERNATIVE = 'ALTERNATIVE',
  NO_ACTION = 'NO_ACTION',
}

export interface ScenarioBranchOutcome {
  branch: ScenarioBranchType;
  description: string;
  projectedStates: any[];
  consequenceAnalysis: any;
  confidenceScore: number;
  financialImpact: {
    estimatedSpend: number;
    estimatedRevenueGain: number;
    runwayImpactMonths: number;
    cashAfterAction: number;
  };
  operationalImpact: {
    workforceSaturationDeltaPct: number;
    deliveryMilestoneRisk: string;
    incidentRiskLevel: string;
    spatialDeskUtilizationDeltaPct?: number;
    marketingLeadLoadDeltaPct?: number;
    pricingMarginImpactPct?: number;
  };
  strategicScore: number;
  uncertaintyFactor: number;
}

export interface CancelScenarioDto {
  companyId: string;
  scenarioId: string;
  cancelledBy: string;
  reason: string;
}

export interface ReconcileScenarioOutcomesDto {
  companyId: string;
  scenarioId: string;
  reconciledBy: string;
  actualMetrics: {
    financialSpend?: number;
    revenueGain?: number;
    profitMarginChange?: number;
    timelineVarianceDays?: number;
    kpiMovements?: Record<string, number>;
    incidentOccurred?: boolean;
    observedRisks?: string[];
    [key: string]: any;
  };
}

export interface ScenarioReconciliationResult {
  scenarioId: string;
  companyId: string;
  status: string;
  reconciledAt: Date;
  reconciledBy: string;
  variances: {
    metric: string;
    predicted: number;
    actual: number;
    absoluteVariance: number;
    variancePercentage: number;
    directionalAccuracy: boolean;
  }[];
  overallForecastAccuracyPct: number;
  overallDirectionalAccuracyPct?: number;
  forecastBias: 'OVER_OPTIMISTIC' | 'OVER_PESSIMISTIC' | 'NEUTRAL' | 'ACCURATE';
  integrityFindingId?: string;
  discrepancyFlagged: boolean;
  calibrationNote: string;
}

export interface ExecutiveDecisionBrief {
  scenarioId: string;
  scenarioName: string;
  companyId: string;
  generatedAt: Date;
  modelRulesVersion: string;
  inputHash: string;
  realityBoundaryDisclaimer: string;
  advisoryGovernanceNotice: string;
  executiveSummary: string;
  branchComparisons: Record<ScenarioBranchType, ScenarioBranchOutcome>;
  comparativeMatrix: {
    dimension: string;
    proposed: string | number;
    alternative: string | number;
    noAction: string | number;
    recommendationAdvantage: string;
  }[];
  criticalAssumptions: string[];
  downstreamDependencies: string[];
  governanceRecommendation: {
    recommendedBranch: ScenarioBranchType;
    rationale: string;
    requiredApprovals: string[];
    constitutionalBoundaryCheck: string;
  };
}
