import {
  CeoDecisionCategory,
  CeoDecisionRiskLevel,
  CeoDecisionConfidence,
  ObjectiveStatus,
  ObjectivePriority,
  RiskLevel,
} from '@prisma/client';
import { DerivedEnterpriseState, DetectedConflict, SignificanceTier } from '../enterprise-brain/enterprise-brain.types';
import { CompanyStateSnapshot } from '../management/company-state.service';


export interface CeoOperationalContext {
  companyId: string;
  assembledAt: Date;
  brainState: DerivedEnterpriseState;
  companySnapshot: CompanyStateSnapshot;
  objectives: {
    strategic: Array<{ id: string; title: string; priority: ObjectivePriority; status: ObjectiveStatus; progress: number }>;
    executive: Array<{ id: string; title: string; priority: ObjectivePriority; status: ObjectiveStatus; progress: number; parentId: string | null }>;
    departmental: Array<{ id: string; title: string; departmentId: string | null; status: ObjectiveStatus; progress: number }>;
  };
  kpis: Array<{ id: string; name: string; targetValue: number; currentValue: number; status: string }>;
  risks: Array<{ id: string; title: string; severity: RiskLevel; score: number; status: string }>;
  opportunities: Array<{ id: string; title: string; type: string; status: string }>;
  resources: {
    headcount: number;
    departmentCount: number;
    acWalletBalance: number;
    realMoneyBalance: number;
    activeBudgets: number;
  };
  activeWork: {
    activeProjects: number;
    readyTasks: number;
    inProgressTasks: number;
    overdueTasks: number;
  };
  organizationalMemory: Array<{
    id: string;
    type: string;
    subject: string;
    content: string;
    relevanceScore: number;
    maturity?: string;
    confidence?: number;
    category?: string;
    evidenceReferences?: string[];
  }>;
  recentDecisions: Array<{ id: string; triggerType: string; proposedAction: string; executionStatus: string; createdAt: Date }>;
  uncertaintyContext: {
    hasDiscrepancy: boolean;
    unresolvedDiscrepancies: DetectedConflict[];
    unverifiedSources: string[];
    preservedUncertaintyNote: string | null;
  };
}

export type DetectionDimension =
  | 'PROBLEMS'
  | 'RISKS'
  | 'OPPORTUNITIES'
  | 'BOTTLENECKS'
  | 'OBJECTIVE_FAILURES'
  | 'KPI_DETERIORATION'
  | 'RESOURCE_CONSTRAINTS'
  | 'EMERGING_STRATEGIC_ISSUES';

export interface ProactiveDetectionSignal {
  id: string;
  companyId: string;
  dimension: DetectionDimension;
  title: string;
  description: string;
  severity: CeoDecisionRiskLevel;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'IMMEDIATE';
  targetEntityType?: string;
  targetEntityId?: string;
  evidence: Record<string, any>;
  recommendedAction: string;
  category: CeoDecisionCategory;
  significanceScore: number;
  significanceTier: SignificanceTier;
  requiresChairmanEscalation: boolean;
}

export type ObjectiveHierarchyLevel =
  | 'STRATEGIC_OBJECTIVE'
  | 'EXECUTIVE_OBJECTIVE'
  | 'DEPARTMENT_OBJECTIVE'
  | 'INITIATIVE'
  | 'TASK'
  | 'ACTION';

export interface ObjectiveTraceNode {
  level: ObjectiveHierarchyLevel;
  id: string;
  title: string;
  status: string;
  ownerId?: string;
  departmentId?: string;
  progress: number;
  parentId?: string;
}

export interface ObjectiveLineageResult {
  taskId: string;
  chain: ObjectiveTraceNode[];
  rootStrategicObjectiveId?: string;
  isAlignedToStrategy: boolean;
}

export type CeoDecisionLifecycleState =
  | 'PROPOSED'
  | 'ANALYZED'
  | 'AUTHORITY_CHECKED'
  | 'PENDING_APPROVAL'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED_STALE';

export interface StructuredDecisionAudit {
  decisionId: string;
  companyId: string;
  ceoId: string;
  category: CeoDecisionCategory;
  action: string;
  evidenceUsed: Record<string, any>;
  alternativesConsidered: Array<{ option: string; tradeOff: string; rejectedReason: string }>;
  assumptions: string[];
  uncertainty: {
    hasUncertainty: boolean;
    confidenceLevel: CeoDecisionConfidence;
    discrepancyNote?: string;
  };
  risksIdentified: Array<{ risk: string; severity: string; mitigation: string }>;
  authorityContext: {
    authorityStatus: string;
    singleLimit: number;
    operation: string;
    withinLimits: boolean;
    requiresChairmanApproval: boolean;
  };
  expectedOutcome: {
    metric: string;
    targetValue: string | number;
    timeline: string;
  };
  consequenceAnalysis?: any;
  actualOutcome?: {
    observedAt: Date;
    success: boolean;
    variance?: string;
    notes?: string;
  };
}

export interface ChairmanDisagreementResult {
  directive: string;
  ceoPov: string;
  evidence: string[];
  consequences: string[];
  recommendation: string;
  consequenceComparison?: any;
  decisionAuthority: 'CHAIRMAN';
  requiresCommandDecision: boolean;
  resolutionStatus: 'PENDING_CHAIRMAN_RESPONSE' | 'CHAIRMAN_AFFIRMED' | 'CHAIRMAN_AMENDED';
}

export interface DecomposeObjectiveParams {
  strategicObjectiveId: string;
  executiveTitle: string;
  departmentId: string;
  departmentObjectiveTitle: string;
  initiativeTitle: string;
  tasks: Array<{ title: string; description?: string; priority?: 'NORMAL' | 'HIGH' | 'URGENT'; dueDays?: number }>;
}

export * from './ceo-consequence.types';
