import { findDomain } from '@/lib/domains';

/** Structural shell for a domain. Shows readiness truthfully and renders no business data. */
export function DomainWorkspace({ slug }: { slug: string }) {
  const d = findDomain(slug);
  return (
    <section aria-labelledby="domain-title" className="space-y-4">
      <h1 id="domain-title" className="text-xl font-semibold">{d.label}</h1>
      <div role="status" data-domain-status={d.status} className="rounded-lg border border-border bg-surface p-6">
        <p className="text-sm font-medium">{d.status === 'blocked' ? 'Blocked' : 'Workspace not built yet'}</p>
        <p className="mt-1 text-sm text-muted">{d.note}</p>
        <ul className="mt-3 space-y-0.5 font-mono text-xs text-muted">
          {d.endpoints.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    </section>
  );
}
