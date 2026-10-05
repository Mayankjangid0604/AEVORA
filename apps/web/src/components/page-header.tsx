import Link from 'next/link';
import type { ReactNode } from 'react';

export interface Crumb { href?: string; label: string }

/** Workspace heading with an in-company breadcrumb. One h2 per page (the company name is the h1). */
export function PageHeader({ title, description, crumbs = [], children }: { title: string; description?: string; crumbs?: Crumb[]; children?: ReactNode }) {
  return (
    <header className="space-y-1">
      {crumbs.length > 0 && (
        <nav aria-label="Section" className="text-xs text-muted">
          <ol className="flex flex-wrap gap-1.5">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex gap-1.5">
                {c.href ? <Link href={c.href} className="hover:text-text">{c.label}</Link> : <span aria-current="page" className="text-text">{c.label}</span>}
                {i < crumbs.length - 1 && <span aria-hidden="true">/</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-text">{title}</h2>
        {children}
      </div>
      {description && <p className="text-sm text-muted">{description}</p>}
    </header>
  );
}

/** Label/value pairs for entity detail views. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="mt-0.5 truncate text-sm text-text">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
