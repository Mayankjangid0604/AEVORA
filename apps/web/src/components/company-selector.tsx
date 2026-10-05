import Link from 'next/link';
import type { AccessibleCompany } from '@/lib/types';
import { StatusBadge } from './status-badge';

/** Renders exactly the companies the backend returned for this session (GET /auth/companies). */
export function CompanySelector({ companies }: { companies: AccessibleCompany[] }) {
  return (
    <ul aria-label="Your companies" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {companies.map((c) => (
        <li key={c.id}>
          <Link
            href={`/company/${encodeURIComponent(c.id)}`}
            className="group flex h-full flex-col justify-between gap-3 rounded-panel border border-border bg-surface p-4 transition-colors duration-150 hover:border-accent"
          >
            <span className="font-medium text-text">{c.name}</span>
            <span className="flex items-center justify-between text-xs text-muted">
              <StatusBadge status={c.status} />
              <span aria-hidden="true" className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
