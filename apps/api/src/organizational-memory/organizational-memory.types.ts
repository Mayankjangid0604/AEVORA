import { OrgMemoryType } from '@prisma/client';
import { ConsequenceSeverity, ReversibilityLevel } from '../ceo/ceo-consequence.types';
import { GatewayRiskTier } from '../external-action-gateway/external-action-gateway.types';

/**
 * AEVORA V16 Slice 5 — Organizational Memory & Strategic Reflection Types
 * Closed-loop learning, expected vs actual analysis, pattern detection,
 * memory maturity, relevance filtering, and structured strategic reflection.
 */

export type MemoryCategory =
  | 'DECISION'
  | 'OUTCOME'
  | 'SUCCESS'
  | 'FAILURE'
  | 'RISK'
  | 'PATTERN'
  | 'LESSON'
  | 'STRATEGY'
  | 'CUSTOMER_INSIGHT'
  | 'OPERATIONAL_INSIGHT'
  | 'RESOURCE_INSIGHT'
  | 'KPI_INSIGHT'
  | 'GOVERNANCE_INSIGHT';

export type MemoryMaturity =
  | 'OBSERVATION'   // Initial single-event observation
  | 'PROVISIONAL'   // Emerging observation pending validation
  | 'CONFIRMED'     // Validated pattern with multiple supporting observations
  | 'DEPRECATED';   // Superseded by newer facts or proven invalid

export type OutcomeClassification =
  | 'SUCCESS'
  | 'PARTIAL_SUCCESS'
  | 'NEUTRAL'
  | 'UNDERPERFORMED'
  | 'FAILED'
  | 'UNKNOWN';      // Preserved when reliable outcome data is unavailable

export interface ExpectedVsActualVariance {
  dimension: string;
  expectedValue: any;
  actualValue: any;
  variancePercentage?: number;
  varianceDescription: string;
  isFavorable: boolean;
}

export interface ConsequencePredictionAccuracy {
  decisionId: string;
  predictedSeverity: ConsequenceSeverity;
  actualSeverity: ConsequenceSeverity;
  severityMatched: boolean;
  predictedFinancialExposure: number;
  actualFinancialExposure: number;
  financialVariance: number;
  predictionAccuracyScore: number; // 0 - 100
  accuracyNotes: string[];
}

export interface DecisionOutcomeEvaluation {
  evaluationId: string;
  decisionId: string;
  companyId: string;
  decisionType: string;
  classification: OutcomeClassification;
  confidenceScore: number; // 0 - 100
  variances: ExpectedVsActualVariance[];
  consequenceAccuracy?: ConsequencePredictionAccuracy;
  externalActionSuccess?: boolean;
  businessOutcomeSuccess: boolean;
  authoritativeSources: string[];
  assumptions: string[];
  attributionLimitations: string[];
  measuredAt: Date;
  unresolvedDiscrepancies: string[];
}

export interface StructuredLesson {
  id: string;
  companyId: string;
  sourceDecisionId?: string;
  sourceTaskId?: string;
  sourceOutcomeId?: string;
  observedSituation: string;
  actionTaken: string;
  expectedResult: string;
  actualResult: string;
  varianceSummary: string;
  likelyRootCause: string;
  confidence: number; // 0 - 100
  applicabilityDomain: string;
  maturity: MemoryMaturity;
  evidenceReferences: string[];
  contradictionCount?: number;
  invalidationReason?: string;
  supersedesId?: string;
  departmentId?: string;
  workerId?: string;
  capability?: string;
  createdAt: Date;
}

export interface DetectedPattern {
  id: string;
  companyId: string;
  patternSignature: string;
  category: MemoryCategory;
  title: string;
  description: string;
  supportingObservationsCount: number;
  supportingDecisionIds: string[];
  supportingTaskIds?: string[];
  affectedScope?: string; // WORKER, CAPABILITY, TASK, DEPENDENCY, DEPARTMENT, RESOURCE, EXTERNAL, GENERAL
  affectedEntityId?: string;
  maturity: MemoryMaturity; // Requires >= 2 observations for CONFIRMED, otherwise PROVISIONAL
  confidence: number;
  contradictionCount?: number;
  invalidationReason?: string;
  recommendedAction?: string;
  firstObservedAt: Date;
  lastObservedAt: Date;
}

export interface StructuredMemoryRecord {
  id: string;
  companyId: string;
  memoryType: OrgMemoryType;
  category: MemoryCategory;
  subject: string;
  content: string;
  maturity: MemoryMaturity;
  confidence: number;
  relevanceScore: number;
  applicableDomain?: string;
  sourceDecisionId?: string;
  sourceRiskId?: string;
  evidenceReferences: string[];
  metadata: Record<string, any>;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StrategicAdjustmentRecommendation {
  adjustmentType: 'OBJECTIVE_CHANGE' | 'PRIORITY_CHANGE' | 'RESOURCE_REALLOCATION' | 'PROCESS_IMPROVEMENT' | 'KPI_TARGET_ADJUSTMENT' | 'RISK_MITIGATION';
  targetEntity: string;
  currentSetting: string;
  recommendedSetting: string;
  rationale: string;
  supportingLessons: string[];
  requiresChairmanApproval: boolean;
}

export interface StrategicReflectionReport {
  reflectionId: string;
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  keySuccesses: string[];
  keyFailures: string[];
  expectationVariances: ExpectedVsActualVariance[];
  recurringPatterns: DetectedPattern[];
  extractedLessons: StructuredLesson[];
  recurringRisks: string[];
  emergingOpportunities: string[];
  strategicImplications: string[];
  recommendedAdjustments: StrategicAdjustmentRecommendation[];
  overallConfidence: number;
  unresolvedUncertainties: string[];
  reflectedAt: Date;
}
