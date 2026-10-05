'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import { useEmployees } from '@/lib/org-queries';
import type { EmployeeSummary, TaskDetail, TaskSummary } from '@/lib/types';
import { DetailList, PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';
import { Timestamp } from './intelligence-views';

const enc = encodeURIComponent;
const base = (companyId: string) => `/company/${enc(companyId)}/tasks`;

export function useEmployeeTasks(companyId: string, employeeId: string | null) {
  return useQuery({
    queryKey: companyKeys.tasks(companyId, 'assignee', employeeId ?? ''),
    queryFn: ({ signal }) => bffGet<TaskSummary[]>(`employees/${enc(employeeId!)}/tasks`, { companyId, signal }),
    enabled: !!employeeId,
  });
}

export function useTask(companyId: string, id: string) {
  return useQuery({
    queryKey: companyKeys.tasks(companyId, 'detail', id),
    queryFn: ({ signal }) => bffGet<TaskDetail>(`tasks/${enc(id)}`, { companyId, signal }),
  });
}

/** Newest first; status filter over the assignee's backend-returned tasks. */
export function filterTasks(rows: TaskSummary[], status: string): TaskSummary[] {
  return rows
    .filter((t) => !status || t.status === status)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

const progressText = (p: number | null) => (p === null ? '—' : `${p}%`);

export function TaskList({ rows, companyId }: { rows: TaskSummary[]; companyId: string }) {
  const href = (t: TaskSummary) => `${base(companyId)}/${enc(t.id)}`;
  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Tasks</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Task</th>
            <th scope="col" className="py-2 pr-4 font-medium">Priority</th>
            <th scope="col" className="hidden py-2 pr-4 font-medium lg:table-cell">Progress (recorded)</th>
            <th scope="col" className="hidden py-2 pr-4 font-medium lg:table-cell">Created</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((t) => (
            <tr key={t.id} className="transition-colors duration-150 hover:bg-surface-2">
              <th scope="row" className="max-w-0 py-2.5 pr-4 font-medium"><Link href={href(t)} className="block truncate text-text hover:text-accent">{t.title}</Link></th>
              <td className="py-2.5 pr-4 text-muted">{t.priority}</td>
              <td className="hidden py-2.5 pr-4 tabular-nums text-muted lg:table-cell">{progressText(t.progress)}</td>
              <td className="hidden py-2.5 pr-4 text-muted lg:table-cell"><Timestamp iso={t.createdAt} /></td>
              <td className="py-2.5"><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden" aria-label="Tasks">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={href(t)} className="block rounded-panel border border-border bg-surface p-3">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-text">{t.title}</span>
                <StatusBadge status={t.status} />
              </span>
              <span className="mt-1 block text-xs text-muted">Priority {t.priority} · progress {progressText(t.progress)} (recorded)</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Tasks by assignee. The backend lists tasks per employee only (GET /employees/:id/tasks); there is no
 * company-wide task listing, so unassigned tasks cannot be shown and no company total is claimed.
 */
export function TasksView({ companyId }: { companyId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const assignee = params?.get('assignee') ?? '';
  const status = params?.get('status') ?? '';
  const employees = useEmployees(companyId);
  const selected: EmployeeSummary | undefined = employees.data?.find((e) => e.id === assignee);
  const tasks = useEmployeeTasks(companyId, selected ? selected.id : null);
  const set = (key: 'assignee' | 'status', value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'assignee') next.delete('status');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const control = 'rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-text';
  const rows = tasks.data ? filterTasks(tasks.data, status) : [];
  const statuses = tasks.data ? [...new Set(tasks.data.map((t) => t.status))].sort() : [];

  return (
    <div className="space-y-4">
      <PageHeader title="Tasks" description="Tasks by assignee, as recorded by AEVORA. Read-only. The backend lists tasks per employee; unassigned tasks are not available here." />
      {employees.isPending ? <SectionSkeleton rows={1} label="assignees" />
        : employees.isError ? <QueryError error={employees.error} />
        : employees.data.length === 0 ? <SystemState kind="empty" title="No assignees" detail="This company has no employees, so no tasks can be listed." />
        : (
          <form role="search" aria-label="Choose tasks" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[14rem] flex-col gap-1 text-xs text-muted">
              Assignee
              <select value={selected ? selected.id : ''} onChange={(e) => set('assignee', e.target.value)} className={control}>
                <option value="">Choose an employee…</option>
                {[...employees.data].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.role ? ` (${e.role.title})` : ''}</option>
                ))}
              </select>
            </label>
            {tasks.data && tasks.data.length > 0 && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Status
                <select value={status} onChange={(e) => set('status', e.target.value)} className={control}>
                  <option value="">All</option>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </form>
        )}

      <section aria-labelledby="task-results" className="rounded-panel border border-border bg-surface p-4">
        <h3 id="task-results" className="sr-only">Results</h3>
        {!selected ? (
          <p className="text-sm text-muted">{assignee && employees.isSuccess ? 'That employee is not part of this company.' : 'Choose an assignee to see their tasks.'}</p>
        ) : tasks.isPending ? <SectionSkeleton rows={5} label="tasks" />
          : tasks.isError ? <QueryError error={tasks.error} />
          : tasks.data.length === 0 ? <SystemState kind="empty" title="No tasks" detail={`${selected.name} has no assigned tasks.`} />
          : rows.length === 0 ? <SystemState kind="empty" title="No matches" detail="No task matches this status." />
          : (
            <>
              <p role="status" aria-live="polite" className="mb-3 text-xs text-muted">{rows.length} of {tasks.data.length} tasks assigned to {selected.name}</p>
              <TaskList rows={rows} companyId={companyId} />
            </>
          )}
      </section>
    </div>
  );
}

export function TaskDetailView({ companyId, taskId }: { companyId: string; taskId: string }) {
  const task = useTask(companyId, taskId);
  const employees = useEmployees(companyId);
  const crumbs = [{ href: base(companyId), label: 'Tasks' }, { label: task.data?.title ?? 'Task' }];
  if (task.isPending) return <SectionSkeleton rows={4} label="task" />;
  if (task.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Task" crumbs={crumbs} />
        <QueryError error={task.error} />
        <Link href={base(companyId)} className="text-sm text-accent hover:underline">Back to tasks</Link>
      </div>
    );
  }
  const t = task.data;
  const assignee = t.assignedEmployeeId ? employees.data?.find((e) => e.id === t.assignedEmployeeId) : undefined;
  const taskLink = (id: string) => <Link href={`${base(companyId)}/${enc(id)}`} className="text-accent hover:underline">Task {id.slice(0, 8)}</Link>;
  return (
    <div className="space-y-4">
      <PageHeader title={t.title} crumbs={crumbs}><StatusBadge status={t.status} label="Task status" /></PageHeader>
      <section aria-label="Task details" className="motion-enter space-y-4 rounded-panel border border-border bg-surface p-4">
        {t.description && <p className="whitespace-pre-line text-sm text-text">{t.description}</p>}
        <DetailList items={[
          { label: 'Assignee', value: assignee
            ? <Link href={`/company/${enc(companyId)}/tasks?assignee=${enc(assignee.id)}`} className="text-accent hover:underline">{assignee.name}</Link>
            : t.assignedEmployeeId ? 'Employee record not available' : 'Unassigned' },
          { label: 'Priority', value: t.priority },
          { label: 'Type', value: t.type },
          { label: 'Progress (as recorded)', value: progressText(t.progress) },
          { label: 'Effort (estimated / actual)', value: `${t.estimatedEffort ?? '—'} / ${t.actualEffort ?? '—'}` },
          { label: 'Project', value: t.projectId ? <Link href={`/company/${enc(companyId)}/projects/${enc(t.projectId)}`} className="text-accent hover:underline">Open project</Link> : 'None' },
          { label: 'Created', value: <Timestamp iso={t.createdAt} /> },
          { label: 'Started', value: <Timestamp iso={t.startedAt} /> },
          { label: 'Completed', value: <Timestamp iso={t.completedAt} /> },
          { label: 'Due', value: <Timestamp iso={t.dueAt} /> },
        ]} />
        {t.goalId && <p className="text-xs text-muted">Linked to a goal (goals are not available in this workspace).</p>}
      </section>
      <Panel title="Dependencies" id="deps-title">
        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Depends on</h3>
            {t.dependsOn.length === 0 ? <p className="text-muted">Nothing.</p> : <ul className="space-y-1">{t.dependsOn.map((id) => <li key={id}>{taskLink(id)}</li>)}</ul>}</div>
          <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Required by</h3>
            {t.requiredBy.length === 0 ? <p className="text-muted">Nothing.</p> : <ul className="space-y-1">{t.requiredBy.map((id) => <li key={id}>{taskLink(id)}</li>)}</ul>}</div>
        </div>
      </Panel>
      <p className="text-xs text-muted">Read-only. Starting, completing, assigning or cancelling tasks is not available in this workspace; task results and worker output are not shown.</p>
    </div>
  );
}
