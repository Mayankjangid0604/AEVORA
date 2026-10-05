import type { EmployeeSummary } from './types';

/**
 * Workforce filters live in the URL. The backend returns the complete company list (no pagination/filter
 * parameters exist), so filtering happens over that returned list.
 * ponytail: client-side over the full list; headcount is capped by MAX_HEADCOUNT (default 100). Move to
 * backend filtering/pagination if companies outgrow that.
 */
export interface WorkforceFilter { q: string; status: string; department: string; type: string }

export function readFilter(params: URLSearchParams | null): WorkforceFilter {
  return {
    q: params?.get('q') ?? '',
    status: params?.get('status') ?? '',
    department: params?.get('department') ?? '',
    type: params?.get('type') ?? '',
  };
}

/** `type` uses backend workerType values; "none" selects employees with no recorded worker profile. */
export function applyFilter(rows: EmployeeSummary[], f: WorkforceFilter, provenance: Map<string, string>): EmployeeSummary[] {
  const q = f.q.trim().toLowerCase();
  return rows
    .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.role?.title.toLowerCase().includes(q) ?? false))
    .filter((e) => !f.status || e.status === f.status)
    .filter((e) => !f.department || e.department?.id === f.department)
    .filter((e) => !f.type || (f.type === 'none' ? !provenance.has(e.id) : provenance.get(e.id) === f.type))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct values actually present in the returned data: filter options are never invented. */
export function filterOptions(rows: EmployeeSummary[], provenance: Map<string, string>) {
  const statuses = [...new Set(rows.map((e) => e.status))].sort();
  const departments = [...new Map(rows.filter((e) => e.department).map((e) => [e.department!.id, e.department!.name])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const types = [...new Set(rows.map((e) => provenance.get(e.id)).filter((t): t is string => !!t))].sort();
  return { statuses, departments, types, hasUnrecorded: rows.some((e) => !provenance.has(e.id)) };
}
