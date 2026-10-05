/**
 * Server-side response projections for BFF routes whose backend payload carries more than the UI may see
 * (e.g. Employee.salary, identitySeed, performance scores). Only the listed fields ever reach the browser.
 * A projection returning `undefined` means "not found" (the BFF answers 404).
 */
import type { DepartmentSummary, EmployeeSummary, WorkerProvenance } from '@/lib/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function department(v: unknown): DepartmentSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  return { id: v.id as string, name: v.name as string, status: str(v.status) ?? 'UNKNOWN' };
}

function employee(v: unknown): EmployeeSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  const role = isObj(v.role) ? { title: str(v.role.title) ?? 'Unknown role' } : null;
  const dept = isObj(v.department) && str(v.department.id) ? { id: v.department.id as string, name: str(v.department.name) ?? 'Unknown department' } : null;
  return { id: v.id as string, name: v.name as string, status: str(v.status) ?? 'UNKNOWN', hireDate: str(v.hireDate), role, department: dept };
}

function provenance(v: unknown): WorkerProvenance | undefined {
  if (!isObj(v) || !str(v.employeeId) || !str(v.workerType)) return undefined;
  return { employeeId: v.employeeId as string, workerType: v.workerType as string };
}

const list = <T>(one: (v: unknown) => T | undefined) => (v: unknown): T[] =>
  (Array.isArray(v) ? v : []).map(one).filter((x): x is T => x !== undefined);

export type Projection = (body: unknown) => unknown;

export const projections = {
  departments: list(department),
  department, // backend returns null for a missing or foreign id -> undefined -> 404
  employees: list(employee),
  employee,
  provenanceList: list(provenance),
  provenance,
} satisfies Record<string, Projection>;
