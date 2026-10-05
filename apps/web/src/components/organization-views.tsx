'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDepartment, useDepartments, useEmployee, useEmployeeProvenance, useEmployees, useProvenance } from '@/lib/org-queries';
import { applyFilter, filterOptions, readFilter, type WorkforceFilter } from '@/lib/workforce-filter';
import { provenanceLabel } from './provenance-badge';
import { DetailList, PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';
import { WorkforceList } from './workforce-list';

const orgBase = (companyId: string) => `/company/${encodeURIComponent(companyId)}/organization`;
const dateFmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
const fmtDate = (iso: string | null) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? <time dateTime={iso!}>{dateFmt.format(d)}</time> : 'Not recorded';
};

/** Organization home: departments (with headcount from the returned workforce) and a workforce entry point. */
export function OrganizationOverview({ companyId }: { companyId: string }) {
  const base = orgBase(companyId);
  const departments = useDepartments(companyId);
  const employees = useEmployees(companyId);
  const perDept = new Map<string, number>();
  for (const e of employees.data ?? []) if (e.department) perDept.set(e.department.id, (perDept.get(e.department.id) ?? 0) + 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Organization" description="Departments and workforce as recorded by AEVORA. Read-only." />

      <Panel
        title="Departments"
        id="departments-title"
        action={departments.data ? <span className="text-xs text-muted">{departments.data.length} returned</span> : undefined}
      >
        {departments.isPending ? <SectionSkeleton label="departments" />
          : departments.isError ? <QueryError error={departments.error} />
          : departments.data.length === 0 ? <SystemState kind="empty" title="No departments" detail="The backend returned no departments for this company." />
          : (
            <ul className="motion-enter grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {[...departments.data].sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                <li key={d.id}>
                  <Link href={`${base}/departments/${encodeURIComponent(d.id)}`} className="flex items-center justify-between gap-3 rounded-control border border-border px-3 py-2.5 hover:border-accent">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">{d.name}</span>
                      <span className="text-xs text-muted">
                        {employees.isSuccess ? `${perDept.get(d.id) ?? 0} ${(perDept.get(d.id) ?? 0) === 1 ? 'person' : 'people'}` : 'Headcount unavailable'}
                      </span>
                    </span>
                    <StatusBadge status={d.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </Panel>

      <Panel
        title="Workforce"
        id="workforce-title"
        action={<Link href={`${base}/workforce`} className="text-xs text-accent hover:underline">Open workforce</Link>}
      >
        {employees.isPending ? <SectionSkeleton rows={1} label="workforce" />
          : employees.isError ? <QueryError error={employees.error} />
          : <p className="text-sm text-muted"><span className="font-semibold tabular-nums text-text">{employees.data.length}</span> people returned by the backend for this company.</p>}
      </Panel>
    </div>
  );
}

/** Workforce list with URL-held filters over the backend-returned company list. */
export function WorkforceView({ companyId }: { companyId: string }) {
  const base = orgBase(companyId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = readFilter(params);
  const employees = useEmployees(companyId);
  const provenance = useProvenance(companyId);
  const prov = provenance.isSuccess ? provenance.data : null;

  const set = (key: keyof WorkforceFilter, value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const rows = employees.data ? applyFilter(employees.data, filter, prov ?? new Map()) : [];
  const opts = employees.data ? filterOptions(employees.data, prov ?? new Map()) : null;
  const select = 'rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-text';

  return (
    <div className="space-y-4">
      <PageHeader title="Workforce" crumbs={[{ href: base, label: 'Organization' }, { label: 'Workforce' }]} />

      {opts && (
        <form role="search" aria-label="Filter workforce" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted">
            Search name or role
            <input type="search" value={filter.q} onChange={(e) => set('q', e.target.value)} className={select} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Status
            <select value={filter.status} onChange={(e) => set('status', e.target.value)} className={select}>
              <option value="">All</option>
              {opts.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Department
            <select value={filter.department} onChange={(e) => set('department', e.target.value)} className={select}>
              <option value="">All</option>
              {opts.departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          {prov && (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Worker type
              <select value={filter.type} onChange={(e) => set('type', e.target.value)} className={select}>
                <option value="">All</option>
                {opts.types.map((t) => <option key={t} value={t}>{provenanceLabel(t)}</option>)}
                {opts.hasUnrecorded && <option value="none">Not recorded</option>}
              </select>
            </label>
          )}
        </form>
      )}

      {provenance.isError && <p role="status" className="text-xs text-warn">Worker type could not be loaded; it is shown as unavailable.</p>}

      <section aria-labelledby="workforce-results" className="rounded-panel border border-border bg-surface p-4">
        <h3 id="workforce-results" className="sr-only">Results</h3>
        {employees.isPending ? <SectionSkeleton rows={5} label="workforce" />
          : employees.isError ? <QueryError error={employees.error} />
          : employees.data.length === 0 ? <SystemState kind="empty" title="No workforce" detail="The backend returned no employees for this company." />
          : rows.length === 0 ? <SystemState kind="empty" title="No matches" detail="No employee matches these filters." />
          : (
            <>
              <p role="status" aria-live="polite" className="mb-3 text-xs text-muted">{rows.length} of {employees.data.length} people</p>
              <WorkforceList rows={rows} provenance={prov} base={base} />
            </>
          )}
      </section>
    </div>
  );
}

export function DepartmentDetail({ companyId, departmentId }: { companyId: string; departmentId: string }) {
  const base = orgBase(companyId);
  const department = useDepartment(companyId, departmentId);
  const employees = useEmployees(companyId);
  const provenance = useProvenance(companyId);
  const members = (employees.data ?? []).filter((e) => e.department?.id === departmentId).sort((a, b) => a.name.localeCompare(b.name));
  const crumbs = [{ href: base, label: 'Organization' }, { label: department.data?.name ?? 'Department' }];

  if (department.isPending) return <SectionSkeleton rows={3} label="department" />;
  if (department.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Department" crumbs={crumbs} />
        <QueryError error={department.error} />
        <Link href={base} className="text-sm text-accent hover:underline">Back to organization</Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <PageHeader title={department.data.name} crumbs={crumbs}><StatusBadge status={department.data.status} label="Department status" /></PageHeader>
      <Panel title="People in this department" id="members-title">
        {employees.isPending ? <SectionSkeleton label="people" />
          : employees.isError ? <QueryError error={employees.error} />
          : members.length === 0 ? <SystemState kind="empty" title="No people" detail="No employee of this company is assigned to this department." />
          : <WorkforceList rows={members} provenance={provenance.isSuccess ? provenance.data : null} base={base} />}
      </Panel>
    </div>
  );
}

export function EmployeeDetail({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const base = orgBase(companyId);
  const employee = useEmployee(companyId, employeeId);
  const provenance = useEmployeeProvenance(companyId, employeeId);
  const crumbs = [{ href: base, label: 'Organization' }, { href: `${base}/workforce`, label: 'Workforce' }, { label: employee.data?.name ?? 'Employee' }];

  if (employee.isPending) return <SectionSkeleton rows={4} label="employee" />;
  if (employee.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Employee" crumbs={crumbs} />
        <QueryError error={employee.error} />
        <Link href={`${base}/workforce`} className="text-sm text-accent hover:underline">Back to workforce</Link>
      </div>
    );
  }
  const e = employee.data;
  return (
    <div className="space-y-4">
      <PageHeader title={e.name} crumbs={crumbs}><StatusBadge status={e.status} label="Employment status" /></PageHeader>
      <section aria-label="Employee details" className="motion-enter rounded-panel border border-border bg-surface p-4">
        <DetailList
          items={[
            { label: 'Role', value: e.role?.title ?? 'Not recorded' },
            { label: 'Department', value: e.department ? <Link href={`${base}/departments/${encodeURIComponent(e.department.id)}`} className="text-accent hover:underline">{e.department.name}</Link> : 'Not recorded' },
            { label: 'Worker type', value: provenance.isPending ? 'Loading…' : provenance.isError ? 'Unavailable' : provenanceLabel(provenance.data) },
            { label: 'Hire date', value: fmtDate(e.hireDate) },
          ]}
        />
      </section>
      <p className="text-xs text-muted">Read-only. Compensation and performance data are not shown in this workspace.</p>
    </div>
  );
}
