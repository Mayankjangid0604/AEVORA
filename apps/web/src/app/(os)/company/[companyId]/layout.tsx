import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { backendFetch } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { SystemState } from '@/components/system-state';
import { COMPANY_DOMAINS } from '@/lib/domains';
import { isSafeId } from '@/lib/http';
import type { Company } from '@/lib/types';

/**
 * Company context gate. The URL companyId is navigation state: it is sent as X-Company-Id and the backend
 * decides. A refusal renders the forbidden state; there is never a fallback to another company.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  if (!isSafeId(companyId)) notFound();

  const r = await backendFetch<Company>(`companies/${companyId}`, { companyId });
  await redirectIfUnauthenticated(r);
  if (!r.ok) {
    return r.status === 403 || r.status === 404
      ? <SystemState kind="forbidden" title="You do not have access to this company." detail="AEVORA did not switch you to another company." />
      : <SystemState kind={r.error.kind} detail={r.error.message} />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <nav aria-label="Context" className="text-xs text-muted"><Link href="/" className="hover:text-text">Home</Link> / Company</nav>
        <h1 className="text-xl font-semibold"><Link href={`/company/${companyId}`}>{r.data.name}</Link></h1>
        <p className="text-xs text-muted">{r.data.status}</p>
      </header>
      <nav aria-label="Company domains" className="flex flex-wrap gap-2">
        {COMPANY_DOMAINS.map((d) => (
          <Link key={d.slug} href={`/company/${companyId}/${d.slug}`} className="rounded-md border border-border px-3 py-1 text-sm text-muted hover:bg-surface-2 hover:text-text">
            {d.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
