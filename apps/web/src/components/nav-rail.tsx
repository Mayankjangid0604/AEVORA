'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { COMPANY_DOMAINS, OS_DOMAINS, type Domain } from '@/lib/domains';
import { companyFromPath } from '@/lib/navigation';

function RailLink({ href, label, current, status }: { href: string; label: string; current: boolean; status?: Domain['status'] }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={`flex items-center justify-between rounded-control px-2.5 py-1.5 text-sm transition-colors duration-150 ${
          current ? 'bg-accent-soft font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text'
        }`}
      >
        <span>{label}</span>
        {status === 'blocked' && <span className="text-[10px] uppercase tracking-wide text-muted">blocked</span>}
      </Link>
    </li>
  );
}

/** Persistent left rail (md and up). Company destinations appear only inside a company context. */
export function NavRail() {
  const pathname = usePathname() ?? '/';
  const companyId = companyFromPath(pathname);
  const base = companyId ? `/company/${companyId}` : null;

  return (
    <nav aria-label="Primary" className="flex h-full flex-col gap-6 overflow-y-auto p-3">
      <Link href="/" className="px-2.5 pt-1 text-sm font-semibold tracking-[0.2em] text-text">AEVORA</Link>
      <ul className="space-y-0.5">
        <RailLink href="/" label="Companies" current={pathname === '/'} />
      </ul>
      {base && (
        <div>
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Company</p>
          <ul className="space-y-0.5">
            <RailLink href={base} label="Home" current={pathname === base} />
            {COMPANY_DOMAINS.map((d) => (
              <RailLink key={d.slug} href={`${base}/${d.slug}`} label={d.label} status={d.status} current={pathname.startsWith(`${base}/${d.slug}`)} />
            ))}
          </ul>
        </div>
      )}
      {OS_DOMAINS.length > 0 && <div>
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Operating system</p>
        <ul className="space-y-0.5">
          {OS_DOMAINS.map((d) => <RailLink key={d.slug} href={`/${d.slug}`} label={d.label} status={d.status} current={pathname.startsWith(`/${d.slug}`)} />)}
        </ul>
      </div>}
    </nav>
  );
}
