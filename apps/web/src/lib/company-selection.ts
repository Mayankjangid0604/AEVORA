import type { AccessibleCompany } from './types';

/**
 * What Home does with the backend's company list. Only ids the backend returned are ever used;
 * there is no fallback company. Entering a company is still authorized by the company layout.
 */
export type SelectionOutcome =
  | { kind: 'none' }
  | { kind: 'enter'; companyId: string }
  | { kind: 'choose'; companies: AccessibleCompany[] };

export function selectionOutcome(companies: AccessibleCompany[]): SelectionOutcome {
  if (companies.length === 0) return { kind: 'none' };
  if (companies.length === 1) return { kind: 'enter', companyId: companies[0]!.id };
  return { kind: 'choose', companies };
}
