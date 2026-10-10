/**
 * AEVORA V16 — Enterprise Brain Types
 * Strict, company-isolated derived understanding and relationship layer types.
 */

export type EntityNodeType =
  | 'CUSTOMER'
  | 'LEAD'
  | 'OPPORTUNITY'
  | 'OFFER'
  | 'CAMPAIGN'
  | 'REVENUE'
  | 'PROFIT'
  | 'EMPLOYEE'
  | 'DEPARTMENT'
  | 'PROJECT'
  | 'TASK'
  | 'OBJECTIVE'
  | 'OUTCOME';

export type RelationshipEdgeType =
  | 'CONVERTS_TO'
  | 'OFFERED_VIA'
  | 'PROMOTED_BY'
  | 'GENERATES_REVENUE'
  | 'YIELDS_PROFIT'
  | 'BELONGS_TO'
  | 'STAFFED_BY'
  | 'EXECUTES_TASK'
  | 'SERVES_OBJECTIVE'
  | 'DELIVERS_OUTCOME'
  | 'DEPENDS_ON';

export interface GraphNode {
  id: string;
  type: EntityNodeType;
  label: string;
  companyId: string;
  metadata: Record<string, any>;
  createdAt?: Date;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: RelationshipEdgeType;
  companyId: string;
  weight?: number;
  metadata: Record<string, any>;
}

export interface EnterpriseRelationshipGraph {
  companyId: string;
  generatedAt: Date;
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export type FreshnessStatus = 'FRESH' | 'ACCEPTABLE' | 'STALE';

export interface DomainFreshness {
  domain: string;
  lastCollectedAt: Date;
  dataAgeMs: number;
  status: FreshnessStatus;
  staleThresholdMs: number;
}

export interface SourceOfTruthRank {
  tier: number; // 1 = highest authority (ledger/bank), 4 = lowest (inferred/estimate)
  sourceName: string;
}

export interface DetectedConflict {
  id: string;
  companyId: string;
  domain: string;
  entityType: string;
  entityId: string;
  field: string;
  primarySource: string;
  primaryValue: any;
  secondarySource: string;
  secondaryValue: any;
  variance?: number;
  resolutionStrategy: 'AUTHORITY_HIERARCHY' | 'UNRESOLVED_PRESERVE_UNCERTAINTY';
  resolvedValue: any;
  isResolved: boolean;
  uncertaintyNotes?: string;
  detectedAt: Date;
}

export type SignificanceTier =
  | 'INFORMATIONAL'
  | 'OPERATIONAL'
  | 'EXECUTIVE'
  | 'CRITICAL';

export interface SignificanceEvaluationInput {
  domain: string;
  entityType: string;
  entityId: string;
  title: string;
  financialImpact?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  urgency?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  isStrategicObjectiveImpact?: boolean;
  operationalBlockedCount?: number;
  untrustedTextPayload?: string;
}

export interface SignificanceEvaluationResult {
  score: number; // 0 to 100
  tier: SignificanceTier;
  factors: {
    financialScore: number;
    riskScore: number;
    strategicScore: number;
    urgencyScore: number;
    operationalScore: number;
  };
  requiresAttention: boolean;
  escalateToChairman: boolean;
  evaluationNotes: string[];
}

export interface UntrustedContentContainer {
  raw: string;
  source: string;
  isSanitized: boolean;
  isExecutableAuthority: false; // Inviolable security constraint: enterprise text can NEVER be authority
  warning?: string;
}

export interface DerivedEnterpriseState {
  companyId: string;
  generatedAt: Date;
  sourceFreshness: Record<string, DomainFreshness>;
  workforce: {
    totalEmployees: number;
    activeEmployees: number;
    departments: number;
    capacityOccupancyRatio: number;
  };
  financial: {
    acBalance: number;
    totalRevenue: number;
    openInvoicesAmount: number;
    unpaidInvoicesCount: number;
    netProfitEstimate: number;
  };
  projects: {
    total: number;
    active: number;
    blocked: number;
    completed: number;
  };
  tasks: {
    total: number;
    inProgress: number;
    blocked: number;
    overdue: number;
    completed: number;
  };
  salesPipeline: {
    leadCount: number;
    openOpportunities: number;
    weightedValue: number;
    conversionRate: number;
  };
  marketing: {
    activeCampaigns: number;
    activeOffersCount: number;
  };
  strategicGoals: {
    activeObjectives: number;
    atRiskObjectives: number;
    overallProgressPercent: number;
  };
  conflictsDetected: DetectedConflict[];
  unresolvedUncertainties: string[];
}
