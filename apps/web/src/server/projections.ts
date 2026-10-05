/**
 * Server-side response projections for BFF routes whose backend payload carries more than the UI may see
 * (e.g. Employee.salary, identitySeed, performance scores). Only the listed fields ever reach the browser.
 * A projection returning `undefined` means "not found" (the BFF answers 404).
 */
import type { DepartmentSummary, EmployeeSummary, ProjectDetail, ProjectMilestone, ProjectRequirement, ProjectRisk, ProjectSummary, ProjectTeamMember, WorkerProvenance } from '@/lib/types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

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

function projectBase(v: Obj): Omit<ProjectSummary, 'assignmentCount'> {
  return {
    id: v.id as string,
    name: v.name as string,
    description: str(v.description),
    type: str(v.type) ?? 'UNKNOWN',
    status: str(v.status) ?? 'UNKNOWN',
    startDate: str(v.startDate),
    targetEndDate: str(v.targetEndDate),
    client: isObj(v.client) && str(v.client.name) ? { name: v.client.name as string } : null,
  };
}

function project(v: unknown): ProjectSummary | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  return { ...projectBase(v), assignmentCount: Array.isArray(v.assignments) ? v.assignments.length : 0 };
}

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function projectDetail(v: unknown): ProjectDetail | undefined {
  if (!isObj(v) || !str(v.id) || !str(v.name)) return undefined;
  const milestones: ProjectMilestone[] = arr(v.milestones).filter(isObj).filter((m) => str(m.id) && str(m.name)).map((m) => ({
    id: m.id as string, name: m.name as string, sequence: num(m.sequence) ?? 0, dueAt: str(m.dueAt), status: str(m.status) ?? 'UNKNOWN',
  }));
  const risks: ProjectRisk[] = arr(v.risks).filter(isObj).filter((r) => str(r.id) && str(r.title)).map((r) => ({
    id: r.id as string, title: r.title as string, severity: num(r.severity) ?? 0, status: str(r.status) ?? 'UNKNOWN',
  }));
  const requirements: ProjectRequirement[] = arr(v.requirements).filter(isObj).filter((r) => str(r.id) && str(r.title)).map((r) => ({
    id: r.id as string, title: r.title as string, priority: str(r.priority) ?? 'UNKNOWN', status: str(r.status) ?? 'UNKNOWN',
  }));
  const team: ProjectTeamMember[] = arr(v.assignments).filter(isObj).filter((a) => isObj(a.employee) && str(a.employeeId)).map((a) => ({
    employeeId: a.employeeId as string,
    name: str((a.employee as Obj).name) ?? 'Unknown',
    role: str(a.role) ?? '—',
    allocation: num(a.allocation) ?? 0,
    status: str(a.status) ?? 'UNKNOWN',
  }));
  return { ...projectBase(v), milestones, risks, requirements, team };
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
  projects: list(project),
  project: projectDetail,
} satisfies Record<string, Projection>;
