/**
 * Monthly salary bands in AC (internal currency; 1,000 AC = ₹1). One table, used for new hires, the backfill and
 * the monthly review floor. ponytail: fixed table in code; move to a DB/Chairman setting if bands change often.
 */
export const SALARY_BANDS_AC = {
  EXECUTIVE: 150_000,   // CEO / chief-level
  MANAGEMENT: 80_000,   // heads, directors, managers
  SENIOR: 45_000,       // role level ≥ 3
  MID: 32_000,          // role level 2
  JUNIOR: 22_000,       // role level 1 (default)
} as const;
export type SalaryBand = keyof typeof SALARY_BANDS_AC;

export function salaryBand(role: { title?: string | null; level?: number | null; accessLevel?: string | null } | null | undefined): SalaryBand {
  const title = (role?.title ?? '').toLowerCase();
  if (/\b(ceo|chief|founder|president)\b/.test(title) || role?.accessLevel === 'SYSTEM') return 'EXECUTIVE';
  if (role?.accessLevel === 'MANAGEMENT' || /\b(head|director|manager|lead)\b/.test(title)) return 'MANAGEMENT';
  const level = role?.level ?? 1;
  return level >= 3 ? 'SENIOR' : level === 2 ? 'MID' : 'JUNIOR';
}

export const bandSalaryAC = (role: Parameters<typeof salaryBand>[0]) => SALARY_BANDS_AC[salaryBand(role)];
