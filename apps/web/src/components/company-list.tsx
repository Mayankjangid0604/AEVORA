'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { ApiError } from '@/lib/http';
import type { AccessibleCompany } from '@/lib/types';
import { Loading, SystemState } from './system-state';

/** Companies derived by the backend from the session (GET /auth/companies). */
export function CompanyList() {
  const q = useQuery({
    queryKey: ['auth', 'companies'],
    queryFn: ({ signal }) => bffGet<AccessibleCompany[]>('auth/companies', { signal }),
  });
  if (q.isPending) return <Loading label="Loading companies" />;
  if (q.isError) return <SystemState kind={q.error instanceof ApiError ? q.error.kind : 'error'} />;
  if (q.data.length === 0) return <SystemState kind="empty" detail="You do not have access to any company." />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((c) => (
        <li key={c.id}>
          <Link href={`/company/${c.id}`} className="block rounded-lg border border-border bg-surface p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-accent">
            <span className="block font-medium">{c.name}</span>
            <span className="text-xs text-muted">{c.status}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
