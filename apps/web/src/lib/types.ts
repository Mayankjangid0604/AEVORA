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
}

/** GET /chairman/decisions — ManagementDecision scalars + proposer. */
export interface ManagementDecision {
  id: string;
  type: string;
  title: string;
  status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  proposer: { id: string; name: string } | null;
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
