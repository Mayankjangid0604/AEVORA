import Link from 'next/link';
import type { EmployeeSummary } from '@/lib/types';
import { ProvenanceBadge } from './provenance-badge';
import { StatusBadge } from './status-badge';

/**
 * Workforce rows. Desktop (md+): a real table. Mobile: a card list with the same fields; not a shrunken table.
 * Only projected, non-sensitive fields exist on EmployeeSummary, so nothing sensitive can be rendered here.
 * provenance: null when the worker-type request failed; shown as "Unavailable" rather than "Not recorded".
 */
export function WorkforceList({ rows, provenance, base }: { rows: EmployeeSummary[]; provenance: Map<string, string> | null; base: string }) {
  const type = (e: EmployeeSummary) => (provenance ? <ProvenanceBadge workerType={provenance.get(e.id)} /> : <span className="text-xs text-muted">Unavailable</span>);
  const href = (e: EmployeeSummary) => `${base}/workforce/${encodeURIComponent(e.id)}`;
  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">Workforce</caption>
        <thead className="border-b border-border text-xs text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Name</th>
            <th scope="col" className="py-2 pr-4 font-medium">Role</th>
            <th scope="col" className="py-2 pr-4 font-medium">Department</th>
            <th scope="col" className="py-2 pr-4 font-medium">Worker type</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((e) => (
            <tr key={e.id} className="transition-colors duration-150 hover:bg-surface-2">
              <th scope="row" className="py-2.5 pr-4 font-medium"><Link href={href(e)} className="text-text hover:text-accent">{e.name}</Link></th>
              <td className="py-2.5 pr-4 text-muted">{e.role?.title ?? '—'}</td>
              <td className="py-2.5 pr-4 text-muted">
                {e.department ? <Link href={`${base}/departments/${encodeURIComponent(e.department.id)}`} className="hover:text-text">{e.department.name}</Link> : '—'}
              </td>
              <td className="py-2.5 pr-4">{type(e)}</td>
              <td className="py-2.5"><StatusBadge status={e.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="space-y-2 md:hidden" aria-label="Workforce">
        {rows.map((e) => (
          <li key={e.id}>
            <Link href={href(e)} className="block rounded-panel border border-border bg-surface p-3">
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-text">{e.name}</span>
                  <span className="block truncate text-xs text-muted">{e.role?.title ?? '—'}{e.department ? ` · ${e.department.name}` : ''}</span>
                </span>
                <StatusBadge status={e.status} />
              </span>
              <span className="mt-2 block">{type(e)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
