import type { ProjectSummary } from './types';

/**
 * Project filters live in the URL. GET /chairman/projects has no filter/sort/pagination parameters and returns
 * every project of the company, so filtering runs over that returned list.
 * ponytail: no backend cap exists on project count (one project per won deal); move to server-side
 * filtering/pagination when a company's project list stops being small.
 */
export interface ProjectFilter { q: string; status: string; type: string }

export function readProjectFilter(params: URLSearchParams | null): ProjectFilter {
  return { q: params?.get('q') ?? '', status: params?.get('status') ?? '', type: params?.get('type') ?? '' };
}

export function applyProjectFilter(rows: ProjectSummary[], f: ProjectFilter): ProjectSummary[] {
  const q = f.q.trim().toLowerCase();
  return rows
    .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.client?.name.toLowerCase().includes(q) ?? false))
    .filter((p) => !f.status || p.status === f.status)
    .filter((p) => !f.type || p.type === f.type)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Only values present in the returned projects are offered. */
export function projectFilterOptions(rows: ProjectSummary[]) {
  return {
    statuses: [...new Set(rows.map((p) => p.status))].sort(),
    types: [...new Set(rows.map((p) => p.type))].sort(),
  };
}
