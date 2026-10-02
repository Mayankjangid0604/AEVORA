import { SALARY_BANDS_AC, bandSalaryAC, salaryBand } from '../config/salary-bands';

/** Monthly review limits: at most ±10 % per month, never below the floor. */
export const MAX_CHANGE_PCT = 10;

const IST_MS = 330 * 60_000;
const ist = (d: Date) => new Date(d.getTime() + IST_MS);
export const istMonth = (d: Date) => ist(d).toISOString().slice(0, 7);
/** True on the last calendar day of the month in India time. */
export function isLastDayOfMonthIST(now: Date): boolean {
  const t = ist(now), next = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1));
  return next.getUTCMonth() !== t.getUTCMonth();
}
export const istHourOf = (now: Date) => ist(now).getUTCHours();

/** Lowest monthly salary a review may set: 80 % of the role's band, and never below the junior band. */
export function salaryFloor(role: Parameters<typeof bandSalaryAC>[0]) {
  return Math.max(SALARY_BANDS_AC.JUNIOR, Math.round(bandSalaryAC(role) * 0.8));
}

export interface ReviewChange { oldSalary: number; newSalary: number; percent: number; needsApproval: boolean; reason: string }

/**
 * Performance 0-100 → salary change: (score − 50) / 5 %, capped at ±10 % (e.g. 90 → +8 %, 30 → −4 %).
 * Executives (CEO / chief-level) never change automatically: their change becomes a Chairman approval.
 */
export function reviewChange(salary: number, performance: number, role: Parameters<typeof bandSalaryAC>[0]): ReviewChange {
  const raw = Math.round((Math.max(0, Math.min(100, performance)) - 50) / 5);
  const percent = Math.max(-MAX_CHANGE_PCT, Math.min(MAX_CHANGE_PCT, raw));
  const floor = salaryFloor(role);
  const base = salary > 0 ? salary : bandSalaryAC(role);
  const newSalary = Math.max(floor, Math.round((base * (100 + percent)) / 100));
  const executive = salaryBand(role) === 'EXECUTIVE';
  const actualPct = base ? Math.round(((newSalary - base) / base) * 1000) / 10 : 0;
  return {
    oldSalary: salary, newSalary, percent: actualPct,
    needsApproval: executive || Math.abs(actualPct) > MAX_CHANGE_PCT,
    reason: `performance ${performance}/100 → ${percent >= 0 ? '+' : ''}${percent}%${newSalary === floor && percent < 0 ? ' (held at the floor)' : ''}`,
  };
}
