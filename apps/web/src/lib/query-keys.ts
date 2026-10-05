/** TanStack Query keys. Company-scoped data always carries the company id, so contexts never share cache. */
export type ChairmanView = 'overview' | 'alerts' | 'decisions' | 'activity';

export const companyKeys = {
  all: (companyId: string) => ['company', companyId] as const,
  chairman: (companyId: string, view: ChairmanView) => ['company', companyId, 'chairman', view] as const,
};
