'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import { applyProjectFilter, projectFilterOptions, readProjectFilter, type ProjectFilter } from '@/lib/project-filter';
import type { ProjectDetail, ProjectSummary } from '@/lib/types';
import { DetailList, PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const CHAIRMAN_ONLY = 'Projects are available to the company Chairman only.';
const base = (companyId: string) => `/company/${encodeURIComponent(companyId)}/projects`;
const dateFmt = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
function DateText({ iso }: { iso: string | null }) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? <time dateTime={iso!}>{dateFmt.format(d)}</time> : <span className="text-muted">Not set</span>;
}

export function useProjects(companyId: string) {
  return useQuery({
    queryKey: companyKeys.projects(companyId, 'list'),
    queryFn: ({ signal }) => bffGet<ProjectSummary[]>('chairman/projects', { companyId, signal }),
  });
}

export function useProject(companyId: string, id: string) {
  return useQuery({
    queryKey: companyKeys.projects(companyId, 'detail', id),
    queryFn: ({ signal }) => bffGet<ProjectDetail>(`chairman/projects/${encodeURIComponent(id)}`, { companyId, signal }),
  });
}

/** Desktop table / mobile cards over projected, non-financial project fields. */
export function ProjectList({ rows, companyId }: { rows: ProjectSummary[]; companyId: string }) {
  const href = (p: ProjectSummary) => `${base(companyId)}/${encodeURIComponent(p.id)}`;
  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Projects</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Project</th>
            <th scope="col" className="py-2 pr-4 font-medium">Client</th>
            <th scope="col" className="py-2 pr-4 font-medium">Type</th>
            <th scope="col" className="hidden py-2 pr-4 font-medium lg:table-cell">Start</th>
            <th scope="col" className="hidden py-2 pr-4 font-medium lg:table-cell">Target end</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((p) => (
            <tr key={p.id} className="transition-colors duration-150 hover:bg-surface-2">
              <th scope="row" className="py-2.5 pr-4 font-medium"><Link href={href(p)} className="text-text hover:text-accent">{p.name}</Link></th>
              <td className="py-2.5 pr-4 text-muted">{p.client?.name ?? '—'}</td>
              <td className="py-2.5 pr-4 text-muted">{p.type}</td>
              <td className="hidden py-2.5 pr-4 text-muted lg:table-cell"><DateText iso={p.startDate} /></td>
              <td className="hidden py-2.5 pr-4 text-muted lg:table-cell"><DateText iso={p.targetEndDate} /></td>
              <td className="py-2.5"><StatusBadge status={p.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden" aria-label="Projects">
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={href(p)} className="block rounded-panel border border-border bg-surface p-3">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.client?.name ?? 'No client'} · {p.type}</span>
                </span>
                <StatusBadge status={p.status} />
              </span>
              <span className="mt-2 block text-xs text-muted">Target end: <DateText iso={p.targetEndDate} /></span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProjectsView({ companyId }: { companyId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filter = readProjectFilter(params);
  const projects = useProjects(companyId);
  const set = (key: keyof ProjectFilter, value: string) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value); else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const rows = projects.data ? applyProjectFilter(projects.data, filter) : [];
  const opts = projects.data && projects.data.length > 0 ? projectFilterOptions(projects.data) : null;
  const control = 'rounded-control border border-border bg-bg px-2 py-1.5 text-sm text-text';

  return (
    <div className="space-y-4">
      <PageHeader title="Projects" description="Client projects recorded by AEVORA. Read-only; tasks are not available in this workspace." />
      {opts && (
        <form role="search" aria-label="Filter projects" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-muted">
            Search project or client
            <input type="search" value={filter.q} onChange={(e) => set('q', e.target.value)} className={control} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Status
            <select value={filter.status} onChange={(e) => set('status', e.target.value)} className={control}>
              <option value="">All</option>
              {opts.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Type
            <select value={filter.type} onChange={(e) => set('type', e.target.value)} className={control}>
              <option value="">All</option>
              {opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </form>
      )}
      <section aria-labelledby="project-results" className="rounded-panel border border-border bg-surface p-4">
        <h3 id="project-results" className="sr-only">Results</h3>
        {projects.isPending ? <SectionSkeleton rows={4} label="projects" />
          : projects.isError ? <QueryError error={projects.error} forbiddenDetail={CHAIRMAN_ONLY} />
          : projects.data.length === 0 ? <SystemState kind="empty" title="No projects" detail="The backend has no projects for this company." />
          : rows.length === 0 ? <SystemState kind="empty" title="No matches" detail="No project matches these filters." />
          : (
            <>
              <p role="status" aria-live="polite" className="mb-3 text-xs text-muted">{rows.length} of {projects.data.length} projects</p>
              <ProjectList rows={rows} companyId={companyId} />
            </>
          )}
      </section>
    </div>
  );
}

/** One-line rows for project sub-records; each section only exists if the backend returned rows. */
function Rows<T extends { id: string }>({ items, empty, render }: { items: T[]; empty: string; render: (t: T) => ReactNode }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return <ul className="divide-y divide-border">{items.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">{render(t)}</li>)}</ul>;
}

export function ProjectDetailView({ companyId, projectId }: { companyId: string; projectId: string }) {
  const project = useProject(companyId, projectId);
  const crumbs = [{ href: base(companyId), label: 'Projects' }, { label: project.data?.name ?? 'Project' }];

  if (project.isPending) return <SectionSkeleton rows={4} label="project" />;
  if (project.isError) {
    return (
      <div className="space-y-3">
        <PageHeader title="Project" crumbs={crumbs} />
        <QueryError error={project.error} forbiddenDetail={CHAIRMAN_ONLY} />
        <Link href={base(companyId)} className="text-sm text-accent hover:underline">Back to projects</Link>
      </div>
    );
  }
  const p = project.data;
  const orgBase = `/company/${encodeURIComponent(companyId)}/organization`;
  return (
    <div className="space-y-4">
      <PageHeader title={p.name} crumbs={crumbs}><StatusBadge status={p.status} label="Project status" /></PageHeader>
      <section aria-label="Project details" className="motion-enter space-y-4 rounded-panel border border-border bg-surface p-4">
        {p.description && <p className="whitespace-pre-line text-sm text-text">{p.description}</p>}
        <DetailList items={[
          { label: 'Client', value: p.client?.name ?? 'Not recorded' },
          { label: 'Type', value: p.type },
          { label: 'Start date', value: <DateText iso={p.startDate} /> },
          { label: 'Target end date', value: <DateText iso={p.targetEndDate} /> },
        ]} />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Team" id="team-title">
          <Rows items={p.team.map((m) => ({ ...m, id: m.employeeId }))} empty="No one is assigned to this project." render={(m) => (
            <>
              <span className="min-w-0">
                <Link href={`${orgBase}/workforce/${encodeURIComponent(m.employeeId)}`} className="block truncate text-sm text-text hover:text-accent">{m.name}</Link>
                <span className="text-xs text-muted">{m.role} · {m.allocation}% allocation</span>
              </span>
              <StatusBadge status={m.status} />
            </>
          )} />
        </Panel>
        <Panel title="Milestones" id="milestones-title">
          <Rows items={[...p.milestones].sort((a, b) => a.sequence - b.sequence)} empty="No milestones recorded." render={(m) => (
            <>
              <span className="min-w-0"><span className="block truncate text-sm text-text">{m.sequence}. {m.name}</span><span className="text-xs text-muted">Due: <DateText iso={m.dueAt} /></span></span>
              <StatusBadge status={m.status} />
            </>
          )} />
        </Panel>
        <Panel title="Requirements" id="requirements-title">
          <Rows items={p.requirements} empty="No requirements recorded." render={(r) => (
            <>
              <span className="min-w-0"><span className="block truncate text-sm text-text">{r.title}</span><span className="text-xs text-muted">Priority {r.priority}</span></span>
              <StatusBadge status={r.status} />
            </>
          )} />
        </Panel>
        <Panel title="Risks" id="risks-title">
          <Rows items={p.risks} empty="No risks recorded." render={(r) => (
            <>
              <span className="min-w-0"><span className="block truncate text-sm text-text">{r.title}</span><span className="text-xs text-muted">Severity {r.severity} (backend value)</span></span>
              <StatusBadge status={r.status} />
            </>
          )} />
        </Panel>
      </div>
      <p className="text-xs text-muted">Read-only. Tasks, deliveries and financial figures are not shown in this workspace.</p>
    </div>
  );
}
