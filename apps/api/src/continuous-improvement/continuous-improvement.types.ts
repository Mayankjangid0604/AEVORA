import { ImprovementStatus } from '@prisma/client';

export enum TargetDomain {
  WORKFORCE_ASSIGNMENT = 'WORKFORCE_ASSIGNMENT',
  PROCESS_CONFIGURATION = 'PROCESS_CONFIGURATION',
  QUALITY_GATE = 'QUALITY_GATE',
  RETRY_POLICY = 'RETRY_POLICY',
  OPERATIONAL_THRESHOLD = 'OPERATIONAL_THRESHOLD',
  CAPABILITY_REQUIREMENT = 'CAPABILITY_REQUIREMENT',
  TASK_DECOMPOSITION = 'TASK_DECOMPOSITION',
  SCHEDULING = 'SCHEDULING',
  DEPARTMENT_WORKFLOW = 'DEPARTMENT_WORKFLOW',
  RESOURCE_ALLOCATION = 'RESOURCE_ALLOCATION',
  KNOWLEDGE_RETRIEVAL = 'KNOWLEDGE_RETRIEVAL',
  PLANNING_HEURISTICS = 'PLANNING_HEURISTICS',
  ORGANIZATIONAL_STRUCTURE = 'ORGANIZATIONAL_STRUCTURE',
  CONSTITUTIONAL_CHANGE = 'CONSTITUTIONAL_CHANGE',
}

export enum ReversibilityType {
  REVERSIBLE = 'REVERSIBLE',
  IRREVERSIBLE = 'IRREVERSIBLE',
  ESCALATION_REQUIRED = 'ESCALATION_REQUIRED',
}

export enum BlastRadius {
  LOCAL = 'LOCAL',
  DEPARTMENT = 'DEPARTMENT',
  ENTERPRISE = 'ENTERPRISE',
  CONSTITUTIONAL = 'CONSTITUTIONAL',
}

export enum ProposalAuthorityRequirement {
  AUTONOMOUS_DELEGATED = 'AUTONOMOUS_DELEGATED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  CHAIRMAN_REQUIRED = 'CHAIRMAN_REQUIRED',
  CONSTITUTIONAL_CHANGE = 'CONSTITUTIONAL_CHANGE',
}

export enum ProposalValidationStatus {
  PENDING = 'PENDING',
  OBSERVING = 'OBSERVING',
  VALIDATED = 'VALIDATED',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
  INCONCLUSIVE = 'INCONCLUSIVE',
}

export enum EntropyCategory {
  ARCHITECTURE = 'ARCHITECTURE',
  DATA = 'DATA',
  GOVERNANCE = 'GOVERNANCE',
  EXECUTION = 'EXECUTION',
  ORGANIZATIONAL = 'ORGANIZATIONAL',
  KNOWLEDGE = 'KNOWLEDGE',
  SIMULATION = 'SIMULATION',
}

export enum EntropySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum RemediationTier {
  AUTO_SAFE = 'AUTO_SAFE',
  PROPOSE = 'PROPOSE',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  CHAIRMAN_REQUIRED = 'CHAIRMAN_REQUIRED',
  NEVER_AUTO_REMEDIATE = 'NEVER_AUTO_REMEDIATE',
}

export interface CanonicalImprovementSignal {
  id: string;
  companyId: string;
  source: string;
  sourceType: string;
  evidenceReferences: string[];
  affectedEntity: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number; // 0 - 100
  recurrence: number;
  expectedImpact: string;
  detectedAt: Date;
  correlationId?: string;
  causationId?: string;
  stateVersion?: number;
  maturity: 'OBSERVATION' | 'PROVISIONAL' | 'CONFIRMED' | 'DEPRECATED';
  status: 'OPEN' | 'REVIEWING' | 'ADDRESSED' | 'DISMISSED';
}

export interface CreateProposalInput {
  companyId: string;
  title: string;
  description: string;
  problem: string;
  observedSignal: string;
  hypothesis: string;
  proposedChange: string;
  expectedImpact: string;
  expectedMetric: string;
  baseline: number;
  target: number;
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  source?: string;
  targetDomain?: TargetDomain | string;
  reversibility?: ReversibilityType | string;
  blastRadius?: BlastRadius | string;
  validationCriteria?: any[];
  rollbackCriteria?: any[];
  simulationRequirement?: 'NONE' | 'RECOMMENDED' | 'MANDATORY';
  authorityRequirement?: ProposalAuthorityRequirement | string;
  version?: number;
  supersedesId?: string;
  correlationId?: string;
  causationId?: string;
  actorId?: string;
}

export interface EntropyFindingDto {
  companyId: string;
  category: EntropyCategory | string;
  severity: EntropySeverity | string;
  detectionSource: string;
  affectedEntity: string;
  evidence: Record<string, any>;
  stateVersion?: number;
  recommendedAction: string;
  autoRemediable?: boolean;
  authorityRequirement?: RemediationTier | string;
  correlationId?: string;
  causationId?: string;
}
