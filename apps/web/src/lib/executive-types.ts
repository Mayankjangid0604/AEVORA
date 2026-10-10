/**
 * AEVORA V16 Slice 6 — Executive Console & Autonomous CEO Types
 * Authoritative types mirroring backend V16 Slices 1–5 contracts.
 */

export type AutonomousOperatingPhase =
  | 'OBSERVE'
  | 'UNDERSTAND'
  | 'ANALYZE'
  | 'DECIDE'
  | 'AUTHORITY_CHECK'
  | 'APPROVE_ESCALATE'
  | 'EXECUTE'
  | 'VERIFY'
  | 'LEARN'
  | 'REFLECT'
  | 'REPLAN';

export type DecisionRiskTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type DecisionLifecycleStatus =
  | 'PROPOSED'
  | 'EVALUATING'
  | 'APPROVED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'BLOCKED';

export type MemoryCategory =
  | 'STRATEGY'
  | 'EXECUTION'
  | 'FINANCE'
  | 'MARKET'
  | 'WORKFORCE'
  | 'SYSTEM';

export type MemoryMaturity =
  | 'OBSERVATION'
  | 'PROVISIONAL'
  | 'CONFIRMED'
  | 'DEPRECATED';

export type ActionGatewayStatus =
  | 'PENDING'
  | 'EXECUTED'
  | 'FAILED'
  | 'BLOCKED'
  | 'REPLAYED';

export interface ConsequenceDimensionScore {
  score: number;
  confidence: number;
  rationale: string;
  keyFactors: string[];
}

export interface ConsequenceAnalysisSummary {
  netScore: number;
  dimensions: {
    financial: ConsequenceDimensionScore;
    revenue: ConsequenceDimensionScore;
    profit: ConsequenceDimensionScore;
    cashFlow: ConsequenceDimensionScore;
    customer: ConsequenceDimensionScore;
    employee: ConsequenceDimensionScore;
    operational: ConsequenceDimensionScore;
    resource: ConsequenceDimensionScore;
    kpi: ConsequenceDimensionScore;
    strategic: ConsequenceDimensionScore;
    regulatory: ConsequenceDimensionScore;
    market: ConsequenceDimensionScore;
    reputational: ConsequenceDimensionScore;
    ecosystem: ConsequenceDimensionScore;
  };
  recommendation: 'PROCEED' | 'PROCEED_WITH_SAFEGUARDS' | 'REJECT' | 'ESCALATE_TO_CHAIRMAN';
  riskTier: DecisionRiskTier;
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
  uncertainty: {
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    rationale: string;
    criticalGaps?: string[];
  };
  mitigations: string[];
}

export interface ScenarioSimulationOutcome {
  scenario: 'OPTIMISTIC' | 'EXPECTED' | 'STRESS';
  probability: number;
  projectedFinancialDelta: number;
  projectedKpiDelta: number;
  narrative: string;
}

export interface DecisionAlternative {
  title: string;
  rationale: string;
  tradeoffs: string;
  score: number;
}

export interface ExpectedOutcomeMetric {
  metric: string;
  baseline: number | string;
  expected: number | string;
  timeframeDays: number;
}

export interface DecisionBrief {
  decisionId: string;
  title: string;
  decisionType: string;
  rationale: string;
  status: DecisionLifecycleStatus;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  createdAt: string;
  evidence: string[];
  assumptions: string[];
  alternatives: DecisionAlternative[];
  expectedOutcomes: ExpectedOutcomeMetric[];
  consequenceAnalysis: ConsequenceAnalysisSummary;
  scenarioSimulations: ScenarioSimulationOutcome[];
  authorityStatus: {
    withinCeoLimit: boolean;
    requiredTier: DecisionRiskTier;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  approvalRequirement: {
    required: boolean;
    reason?: string;
    approvalId?: string;
  };
}

export interface CeoAutonomousDecisionSummary {
  id: string;
  type: string;
  title: string;
  status: DecisionLifecycleStatus;
  riskTier: DecisionRiskTier;
  urgency: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  createdAt: string;
  netScore: number;
  recommendation: string;
  needsChairmanApproval: boolean;
  approvalId?: string;
  approvalStatus?: string;
}

export interface CeoOperatingState {
  currentPhase: AutonomousOperatingPhase;
  lastRunAt: string | null;
  activeGoal: string | null;
  operatingHealth: 'HEALTHY' | 'DEGRADED' | 'ATTENTION_REQUIRED';
  activeObjectivesCount: number;
  pendingDecisionsCount: number;
  pendingApprovalsCount: number;
  recentDecisions: CeoAutonomousDecisionSummary[];
  priorities: {
    id: string;
    title: string;
    priority: string;
    targetDate: string | null;
  }[];
}

export interface CeoObjectiveHierarchy {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  targetDate: string | null;
  tasks: {
    id: string;
    title: string;
    leadRoleTitle: string;
    status: string;
    priority: string;
  }[];
}

export interface ProactiveSignal {
  id: string;
  type: 'RISK' | 'OPPORTUNITY' | 'ANOMALY' | 'BOTTLENECK';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  recommendedAction: string;
  detectedAt: string;
}

export interface DirectiveEvaluationResult {
  directive: string;
  aligned: boolean;
  conflictDetected: boolean;
  conflictReason?: string;
  ceoAlternative?: {
    title: string;
    rationale: string;
    expectedBenefits: string[];
  };
  consequenceComparison?: {
    directiveRisk: DecisionRiskTier;
    directiveFinancialExposure: number;
    alternativeRisk: DecisionRiskTier;
    alternativeFinancialExposure: number;
    netImpactDelta: string;
  };
}

export interface EnterpriseBrainSummary {
  companyId: string;
  timestamp: string;
  financialSummary: {
    totalBudget: number;
    totalAllocated: number;
    totalSpent: number;
    remainingBudget: number;
    cashFlowEstimate: number;
    currency: string;
  };
  workforceSummary: {
    totalEmployees: number;
    activeEmployees: number;
    departmentCount: number;
    leadCount: number;
  };
  projectsSummary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    blockedProjects: number;
  };
  kpis: {
    financialHealth: number;
    operationalEfficiency: number;
    deliveryReliability: number;
    strategicAlignment: number;
  };
  nodeCount: number;
  edgeCount: number;
  freshnessTimestamp: string;
}

export interface BrainConflict {
  id: string;
  type: 'FINANCIAL' | 'CAPACITY' | 'SCHEDULE' | 'DEPENDENCY';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  entitiesInvolved: string[];
  suggestedResolution: string;
}

export interface ExternalActionAuditItem {
  actionId: string;
  actionType: string;
  tier: DecisionRiskTier;
  status: ActionGatewayStatus;
  provider: string;
  financialExposure: number;
  idempotencyKey: string;
  targetRecipient?: string;
  intendedEffect?: string;
  timestamp: string;
  externalReferenceId?: string;
  errorMessage?: string;
  actualOutcomeRecorded?: string;
}

export interface StructuredMemoryItem {
  id: string;
  category: MemoryCategory;
  maturity: MemoryMaturity;
  subject: string;
  content: string;
  confidence: number;
  applicableDomain: string;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StrategicReflectionReportItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  evaluationsCount: number;
  decisionSuccessRate: number;
  predictionAccuracyRate: number;
  recurringPatterns: {
    pattern: string;
    occurrences: number;
    significance: string;
  }[];
  replanningRecommendations: {
    objectiveId?: string;
    recommendation: string;
    rationale: string;
    urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
}

export interface V15SpatialContext {
  activeCampus: string;
  totalRooms: number;
  deskCapacity: number;
  currentOccupancy: number;
  activeAvatars: number;
  lastSpatialSync: string;
}

export interface V24OfferContext {
  activeCampaignsCount: number;
  offersDispatchedToday: number;
  averageDiscountPercent: number;
  maxAutonomousDiscountLimit: number; // 50% deterministic safeguard
  v24GatewayProvider: string;
}
