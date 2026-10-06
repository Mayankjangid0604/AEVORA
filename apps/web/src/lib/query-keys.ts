/** TanStack Query keys. Company-scoped data always carries the company id, so contexts never share cache. */
export type ChairmanView = 'overview' | 'alerts' | 'decisions' | 'activity';

export const companyKeys = {
  all: (companyId: string) => ['company', companyId] as const,
  chairman: (companyId: string, view: ChairmanView) => ['company', companyId, 'chairman', view] as const,
  org: (companyId: string, ...parts: string[]) => ['company', companyId, 'org', ...parts] as const,
  projects: (companyId: string, ...parts: string[]) => ['company', companyId, 'projects', ...parts] as const,
  intelligence: (companyId: string, ...parts: string[]) => ['company', companyId, 'intelligence', ...parts] as const,
  ceo: (companyId: string, ...parts: string[]) => ['company', companyId, 'ceo', ...parts] as const,
  growth: (companyId: string, ...parts: string[]) => ['company', companyId, 'growth', ...parts] as const,
  operations: (companyId: string, ...parts: string[]) => ['company', companyId, 'operations', ...parts] as const,
  tasks: (companyId: string, ...parts: string[]) => ['company', companyId, 'tasks', ...parts] as const,
};
