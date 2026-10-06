/** Shapes of the backend responses this slice consumes (verified against apps/api controllers). */

/** GET /auth/me */
export interface Me {
  actorId: string;
  actorType: 'CHAIRMAN' | 'EMPLOYEE';
  actorRole: string;
  name: string;
  email: string | null;
  companyId: string | null;
}

/** GET /auth/companies */
export interface AccessibleCompany { id: string; name: string; status: string; groupId: string | null }

/** GET /companies/:id (subset rendered) */
export interface Company { id: string; name: string; legalName: string | null; description: string | null; status: string }

/** GET /groups, GET /groups/:id (subset rendered) */
export interface Group { id: string; name: string; description: string | null; companies?: { id: string; name: string; status: string }[] }

/**
 * GET /chairman/overview (subset rendered). Counts are database counts for the selected company.
 * `treasury` and `financials` exist in the response but are not rendered: their units/shape are not verified.
 */
export interface ChairmanOverview {
  company: { id: string; name: string; status: string };
  employees: { total: number; active: number };
  projects: { total: number; active: number };
  alerts: number;
  pendingDecisions: number;
}

/** GET /chairman/alerts — OperationalAlert scalars. */
export interface OperationalAlert {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/** GET /chairman/decisions — ManagementDecision scalars + proposer. */
export interface ManagementDecision {
  id: string;
  type: string;
  title: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  proposer: { id: string; name: string } | null;
  description: string | null;
  updatedAt: string | null;
  approvedAt: string | null;
  targetEmployee: { id: string; name: string } | null;
}

/** GET /ceo/feed — what the AI CEO recorded (reviews, its actions, weekly reports). */
export interface CeoFeedItem { id: string; at: string; kind: string; outcome: string | null; title: string; detail: string }

/** GET /ceo/questions — CeoQuestion without its context JSON. */
export interface CeoQuestionView {
  id: string; question: string; urgency: string; status: string;
  askedAt: string; answeredAt: string | null; chairmanAnswer: string | null;
}

/** GET /chairman/activity — CompanyEvent (payload not rendered). */
export interface CompanyEvent { id: string; type: string; createdAt: string }

/** GET /organization/departments(/:id), projected by the BFF to these fields only. */
export interface DepartmentSummary { id: string; name: string; status: string }

/**
 * GET /organization/employees, /organization/employee/:id, projected by the BFF.
 * Salary, identity seed, performance/reliability scores and credential fields never leave the server.
 */
export interface EmployeeSummary {
  id: string;
  name: string;
  status: string;
  hireDate: string | null;
  role: { title: string } | null;
  department: { id: string; name: string } | null;
}

/** GET /workforce/profiles(/:employeeId), projected to the backend-recorded worker type only. */
export interface WorkerProvenance { employeeId: string; workerType: string }

/**
 * GET /chairman/projects, projected by the BFF. Financial fields (quotedPrice, revenue, cost, margin,
 * financialStatus), opportunity/proposal ids and full employee rows never leave the server.
 * Project has no owner or department field in the backend, so none is shown.
 */
export interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  startDate: string | null;
  targetEndDate: string | null;
  client: { name: string } | null;
  /** Number of project assignments the backend returned (all statuses). */
  assignmentCount: number;
}

export interface ProjectMilestone { id: string; name: string; sequence: number; dueAt: string | null; status: string }
export interface ProjectRisk { id: string; title: string; severity: number; status: string }
export interface ProjectRequirement { id: string; title: string; priority: string; status: string }
export interface ProjectTeamMember { employeeId: string; name: string; role: string; allocation: number; status: string }

/** GET /chairman/projects/:id, projected. Tasks, deliveries, plans, revenue and cost records are not forwarded. */
export interface ProjectDetail extends Omit<ProjectSummary, 'assignmentCount'> {
  milestones: ProjectMilestone[];
  risks: ProjectRisk[];
  requirements: ProjectRequirement[];
  team: ProjectTeamMember[];
}

/**
 * GET /company-intelligence/company/:companyId, projected. Computed by the backend on request from current
 * company state (no model call). Not forwarded: the hard-coded `confidence`, generic `uncertainty`/`limitations`
 * text, and finance metrics (units unverified).
 */
export interface IntelligenceSummary {
  generatedAt: string | null;
  metrics: { key: string; value: number; domain: string }[];
  facts: { statement: string; source: string | null }[];
  risks: { title: string; count: number | null }[];
  opportunities: { title: string; count: number | null }[];
  trends: { title: string; description: string | null }[];
  missingData: string[];
  sources: { name: string; asOf: string }[];
}

/** GET /intelligence/company/:companyId/proposals, projected. `confidence`/`impactLevel` are backend strings shown verbatim. */
export interface DecisionProposalView {
  id: string;
  title: string;
  problem: string;
  recommendation: string;
  rationale: string;
  confidence: string;
  impactLevel: string;
  status: string;
  createdAt: string;
  sessionId: string | null;
  /** Employee who raised it (DecisionProposal.employeeId), same company. */
  proposerId: string | null;
  options: { id: string; title: string; description: string; estimatedEffort: string | null; estimatedImpact: string | null; score: number | null }[];
  reviews: { id: string; result: string; feedback: string | null; createdAt: string }[];
}

/** GET /intelligence/company/:companyId/assistance-requests, projected. */
export interface AssistanceRequestView { id: string; question: string; reason: string | null; urgency: string; status: string; createdAt: string }

/** GET /intelligence/sessions/:id, projected. Raw JSON assessment fields and plans are not forwarded. */
export interface IntelligenceSessionView {
  id: string;
  objective: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  assessments: { id: string; summary: string; recommendation: string; createdAt: string }[];
  proposals: { id: string; title: string; status: string }[];
}

/**
 * GET /employees/:id/tasks and GET /tasks/:id, projected. Not forwarded: createdBy (raw actor id),
 * requiredCapability, companyId, the TaskResult output/errors JSON and any other backend field.
 * `progress` is the backend's own recorded value.
 */
export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  progress: number | null;
  dueAt: string | null;
  createdAt: string | null;
  completedAt: string | null;
  assignedEmployeeId: string | null;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  estimatedEffort: number | null;
  actualEffort: number | null;
  startedAt: string | null;
  updatedAt: string | null;
  goalId: string | null;
  projectId: string | null;
  departmentId: string | null;
  parentTaskId: string | null;
  /** Prerequisite task ids (this task depends on them). */
  dependsOn: string[];
  /** Task ids that depend on this task. */
  requiredBy: string[];
}

/** GET /marketing-content/posts — ContentPost (model-generated by PIXEL); imagePrompt and creator id dropped. */
export interface ContentPostView {
  id: string; platform: string; contentType: string; caption: string; hashtags: string[]; status: string;
  scheduledFor: string | null; postedAt: string | null; createdAt: string;
}

/** GET /lead-gen/runs — LeadGenRun without its error text. */
export interface LeadGenRunView { id: string; status: string; triggeredBy: string; triggeredAt: string; completedAt: string | null; totalFound: number | null; totalNew: number | null }

/** GET /lead-gen/leads — SalesLead business fields only; contact details, notes, metadata and scores dropped. */
export interface SalesLeadView {
  id: string; name: string; industry: string | null; geography: string | null; companySize: string | null;
  status: string; source: string | null; createdAt: string; lastContactedAt: string | null;
}
