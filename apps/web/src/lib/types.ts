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
