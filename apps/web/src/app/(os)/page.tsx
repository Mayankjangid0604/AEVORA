import Link from 'next/link';
import { redirect } from 'next/navigation';
import { backendFetch } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { CompanySelector } from '@/components/company-selector';
import { SystemState } from '@/components/system-state';
import { selectionOutcome } from '@/lib/company-selection';
import type { AccessibleCompany, Group } from '@/lib/types';

/**
 * Company selection. The list is the backend's GET /auth/companies for this session, nothing else.
 * One company: go straight in (the company layout still authorises it). Several: explicit choice.
 */
export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const r = await backendFetch<AccessibleCompany[]>('auth/companies');
  await redirectIfUnauthenticated(r);
  if (!r.ok) return <SystemState kind={r.error.kind} />;

  const outcome = selectionOutcome(Array.isArray(r.data) ? r.data : []);
  // `?choose=1` lets a single-company user reach this page deliberately (e.g. "Switch company").
  if (outcome.kind === 'enter' && !(await searchParams).choose) redirect(`/company/${encodeURIComponent(outcome.companyId)}`);

  // Group entry point: only groups GET /groups returns for this Chairman (CHAIRMAN-only; any failure hides the section).
  const g = await backendFetch<Group[]>('groups');
  const groups = g.ok && Array.isArray(g.data) ? g.data.filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string') : [];

  return (
    <section aria-labelledby="companies-title" className="space-y-5">
      <header>
        <h1 id="companies-title" className="text-xl font-semibold">Companies</h1>
        <p className="mt-1 text-sm text-muted">Companies your account can access. Choose one to open its operating view.</p>
      </header>
      {outcome.kind === 'none'
        ? <SystemState kind="empty" title="No accessible company" detail="AEVORA found no company this account can access." />
        : <CompanySelector companies={outcome.kind === 'enter' ? (r.data as AccessibleCompany[]) : outcome.companies} />}
      {groups.length > 0 && (
        <section aria-labelledby="groups-title" className="space-y-2">
          <h2 id="groups-title" className="text-sm font-semibold">Groups</h2>
          <ul className="space-y-1">
            {groups.map((x) => <li key={x.id}><Link className="text-accent hover:underline" href={`/group/${encodeURIComponent(x.id)}`}>{x.name}</Link></li>)}
          </ul>
        </section>
      )}
    </section>
  );
}
