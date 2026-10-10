import { CeoDecisionCategory, CeoDecisionRiskLevel, CeoDecisionConfidence } from '@prisma/client';

/**
 * AEVORA V16 Slice 3 — Consequence Analysis & Simulation Types
 * 14-dimension consequence framework, deterministic calculations,
 * second-order impact propagation, and scenario simulation models.
 */

export type ConsequenceDimension =
  | 'FINANCIAL_IMPACT'
  | 'REVENUE_IMPACT'
  | 'PROFIT_IMPACT'
  | 'CASH_FLOW_IMPACT'
  | 'CUSTOMER_IMPACT'
  | 'EMPLOYEE_IMPACT'
  | 'OPERATIONAL_IMPACT'
  | 'RESOURCE_IMPACT'
  | 'KPI_IMPACT'
  | 'STRATEGIC_OBJECTIVE_IMPACT'
  | 'RISK_IMPACT'
  | 'COMPLIANCE_IMPACT'
  | 'REPUTATION_IMPACT'
  | 'TIME_DEPENDENCY_IMPACT';

export const ALL_14_CONSEQUENCE_DIMENSIONS: ConsequenceDimension[] = [
  'FINANCIAL_IMPACT',
  'REVENUE_IMPACT',
  'PROFIT_IMPACT',
  'CASH_FLOW_IMPACT',
  'CUSTOMER_IMPACT',
  'EMPLOYEE_IMPACT',
  'OPERATIONAL_IMPACT',
  'RESOURCE_IMPACT',
  'KPI_IMPACT',
  'STRATEGIC_OBJECTIVE_IMPACT',
  'RISK_IMPACT',
  'COMPLIANCE_IMPACT',
  'REPUTATION_IMPACT',
  'TIME_DEPENDENCY_IMPACT',
];

export type ReversibilityLevel =
  | 'REVERSIBLE'
  | 'PARTIALLY_REVERSIBLE'
  | 'DIFFICULT_TO_REVERSE'
  | 'EFFECTIVELY_IRREVERSIBLE';

export type ConsequenceSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type ImpactPolarity = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface DirectConsequence {
  dimension: ConsequenceDimension;
  description: string;
  calculatedValue?: number;
  unit?: string;
  polarity: ImpactPolarity;
  isDeterministic: boolean;
}

export interface SecondOrderConsequence {
  triggerEffect: string;
  downstreamDimension: ConsequenceDimension;
  downstreamEffect: string;
  tracePath: string[]; // e.g. ['Budget Reduction', 'Department Capacity Cut', 'Task Delay', 'KPI Deterioration']
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  severity: ConsequenceSeverity;
}

export interface DimensionScore {
  score: number; // 0 to 100
  impact: ImpactPolarity;
  details: string;
  isDeterministic: boolean;
}

export type ScenarioType = 'PROPOSED' | 'ALTERNATIVE' | 'NO_ACTION';

export interface ScenarioSimulationResult {
  scenario: ScenarioType;
  title: string;
  description: string;
  knownFacts: Record<string, any>;
  calculatedConsequences: DirectConsequence[];
  secondOrderConsequences: SecondOrderConsequence[];
  assumptions: string[];
  estimatedProbabilisticOutcomes: Array<{
    outcome: string;
    probability: number;
    expectedImpact: string;
  }>;
  unresolvedUncertainties: Array<{
    description: string;
    source: string;
    isDiscrepancy: boolean;
  }>;
  financialNetImpact: number;
  riskScoreDelta: number;
  projectedTimelineDeltaDays: number;
}

export interface AffectedEntitySummary {
  id: string;
  type: string;
  name: string;
  impactDescription: string;
  severity: ConsequenceSeverity;
}

export interface DependencyAnalysisItem {
  entityId: string;
  entityType: string;
  dependencyType: string;
  status: string;
  isCriticalPath: boolean;
}

export interface ConsequenceRiskItem {
  title: string;
  severity: CeoDecisionRiskLevel;
  probability: 'LOW' | 'MEDIUM' | 'HIGH';
  mitigation: string;
}

export interface ConsequenceUncertaintyItem {
  description: string;
  source: string;
  isDiscrepancy: boolean;
  confidenceImpact: number;
}

export interface StructuredConsequenceReport {
  decisionId?: string;
  decisionSummary: {
    triggerType: string;
    category: CeoDecisionCategory;
    proposedAction: string;
    targetEntityType?: string;
    targetEntityId?: string;
    estimatedCost: number;
  };
  assumptions: string[];
  evidence: Record<string, any>;
  affectedEntities: AffectedEntitySummary[];
  positiveConsequences: string[];
  negativeConsequences: string[];
  directConsequences: DirectConsequence[];
  secondOrderConsequences: SecondOrderConsequence[];
  dependencies: DependencyAnalysisItem[];
  risks: ConsequenceRiskItem[];
  uncertainties: ConsequenceUncertaintyItem[];
  reversibility: ReversibilityLevel;
  confidence: CeoDecisionConfidence;
  recommendedMitigation: string[];
  overallSeverity: ConsequenceSeverity;
  dimensionScores: Record<ConsequenceDimension, DimensionScore>;
  scenarios?: Record<ScenarioType, ScenarioSimulationResult>;
  generatedAt: Date;
}

export interface ConsequenceAnalysisInput {
  companyId: string;
  ceoId: string;
  decisionId?: string;
  triggerType: string;
  category: CeoDecisionCategory;
  proposedAction: string;
  situation?: string;
  targetEntityType?: string;
  targetEntityId?: string;
  estimatedCost?: number;
  riskLevel?: CeoDecisionRiskLevel;
  isReversible?: boolean;
  alternativesConsidered?: Array<{ option: string; tradeOff: string; rejectedReason: string }>;
  assumptions?: string[];
  includeSimulation?: boolean;
}

export interface ChairmanDecisionBrief {
  decisionId: string;
  companyId: string;
  briefTitle: string;
  executiveSummary: string;
  decisionSubject: string;
  proposer: string;
  consequenceAnalysis: StructuredConsequenceReport;
  scenarioComparison: {
    proposed: ScenarioSimulationResult;
    alternative?: ScenarioSimulationResult;
    noAction: ScenarioSimulationResult;
  };
  recommendedAction: string;
  escalationReason: string;
  requiresChairmanApproval: boolean;
  generatedAt: Date;
}

export interface DisagreementConsequenceComparison {
  directive: string;
  ceoPov: string;
  supportingEvidence: string[];
  consequenceComparison: {
    directiveConsequences: StructuredConsequenceReport;
    ceoAlternativeConsequences: StructuredConsequenceReport;
    noActionBaseline: ScenarioSimulationResult;
  };
  alternatives: Array<{ option: string; rationale: string; consequenceSummary: string }>;
  risks: Array<{ title: string; severity: string; probability: string }>;
  recommendation: string;
  decisionAuthority: 'CHAIRMAN';
}
