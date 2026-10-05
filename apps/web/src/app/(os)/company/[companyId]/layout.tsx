import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { backendFetch } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { SystemState } from '@/components/system-state';
import { StatusBadge } from '@/components/status-badge';
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
      ? (
        <div className="space-y-3">
          <SystemState kind="forbidden" title="You do not have access to this company." detail="AEVORA did not switch you to another company." />
          <Link href="/?choose=1" className="inline-block text-sm text-accent hover:underline">Back to your companies</Link>
        </div>
      )
      : <SystemState kind={r.error.kind} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <ol className="flex gap-1.5">
              <li><Link href="/?choose=1" className="hover:text-text">Companies</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="truncate text-text">{r.data.name}</li>
            </ol>
          </nav>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold">
            <span className="truncate">{r.data.name}</span>
            <StatusBadge status={r.data.status} />
          </h1>
          {r.data.legalName && r.data.legalName !== r.data.name && <p className="text-xs text-muted">{r.data.legalName}</p>}
        </div>
        <Link href="/?choose=1" className="rounded-control border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text">
          Switch company
        </Link>
      </div>
      {children}
    </div>
  );
}
