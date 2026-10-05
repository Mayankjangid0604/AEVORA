/**
 * Domain readiness registry. A route existing does not mean its domain is ready: a workspace renders
 * backend data only when status is 'ready' (its routes verified and allowlisted in the BFF).
 */
export type DomainStatus = 'ready' | 'not-built' | 'blocked';

export interface Domain {
  slug: string;
  label: string;
  status: DomainStatus;
  /** Backend routes confirmed to exist in apps/api (authorization reviewed in AEVORA_V14_SLICE1_CLOSURE_REPORT.md). */
  endpoints: string[];
  note: string;
}

const REVIEW = 'Authorization reviewed (see AEVORA_V14_SLICE1_CLOSURE_REPORT.md). Workspace not built yet.';

export const COMPANY_DOMAINS: Domain[] = [
  { slug: 'ceo', label: 'AI CEO', status: 'not-built', endpoints: ['GET /ceo/operating-state', 'GET /ceo/feed'], note: REVIEW },
  { slug: 'organization', label: 'Organization', status: 'ready', endpoints: ['GET /organization/departments', 'GET /organization/departments/:id', 'GET /organization/employees', 'GET /organization/employee/:id', 'GET /workforce/profiles', 'GET /workforce/profiles/:employeeId'], note: 'Read-only. Departments and workforce from the backend; salary and credential fields are never sent to the browser.' },
  { slug: 'projects', label: 'Projects', status: 'ready', endpoints: ['GET /chairman/projects', 'GET /chairman/projects/:id'], note: 'Read-only, Chairman only. Tasks, deliveries and financial figures are not forwarded to the browser.' },
  { slug: 'tasks', label: 'Tasks', status: 'blocked', endpoints: ['GET /tasks/:id', 'GET /employees/:id/tasks'], note: 'Isolation fixed in V14 slice 1, but no company-wide task listing endpoint exists yet.' },
  { slug: 'research', label: 'Research', status: 'not-built', endpoints: ['GET /chairman/research/*', 'GET /research/:id'], note: REVIEW },
  { slug: 'marketing', label: 'Marketing', status: 'not-built', endpoints: ['GET /marketing/*'], note: REVIEW },
  { slug: 'sales', label: 'Sales', status: 'not-built', endpoints: ['GET /sales/*', 'GET /outreach/*'], note: REVIEW },
  { slug: 'intelligence', label: 'Intelligence', status: 'not-built', endpoints: ['GET /intelligence/company/:companyId/proposals'], note: REVIEW },
  { slug: 'improvement', label: 'Improvement', status: 'not-built', endpoints: ['GET /continuous-improvement/company/:companyId/proposals'], note: 'Isolation fixed and tested in V14 slice 1. Workspace not built yet.' },
  { slug: 'operations', label: 'Operations', status: 'blocked', endpoints: ['GET /autonomous-enterprise/dashboard/summary'], note: 'Operating Loop: all routes company-scoped in the V14 closure, but chairman/operating-loop/* is broken (reads an identity field the JWT never carries) and no workspace is built.' },
];

export const OS_DOMAINS: Domain[] = [
  { slug: 'attention', label: 'Attention', status: 'not-built', endpoints: ['GET /chairman/alerts'], note: REVIEW },
  { slug: 'decisions', label: 'Decisions', status: 'not-built', endpoints: ['GET /chairman/decisions', 'GET /autonomous-enterprise/decisions'], note: REVIEW },
  { slug: 'reports', label: 'Reports', status: 'not-built', endpoints: ['GET /groups/:id/report', 'GET /boardroom/*'], note: REVIEW },
  { slug: 'assistant', label: 'Assistant', status: 'not-built', endpoints: ['GET /assistant/messages'], note: REVIEW },
  { slug: 'admin', label: 'Admin', status: 'not-built', endpoints: ['GET /model-platform/*'], note: REVIEW },
];

export function findDomain(slug: string): Domain {
  const d = [...COMPANY_DOMAINS, ...OS_DOMAINS].find((x) => x.slug === slug);
  if (!d) throw new Error(`Unknown domain ${slug}`);
  return d;
}
