import Link from 'next/link';
import type { ReactNode } from 'react';
import { OS_DOMAINS } from '@/lib/domains';
import type { Me } from '@/lib/types';
import { UserMenu } from './user-menu';

export function OsShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <nav aria-label="AEVORA" className="hidden w-56 shrink-0 border-r border-border bg-surface p-4 md:block">
        <Link href="/" className="block text-sm font-semibold tracking-wide">AEVORA</Link>
        <ul className="mt-6 space-y-1 text-sm">
          <li><Link href="/" className="block rounded px-2 py-1.5 hover:bg-surface-2">Home</Link></li>
          {OS_DOMAINS.map((d) => (
            <li key={d.slug}>
              <Link href={`/${d.slug}`} className="block rounded px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-text">{d.label}</Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <Link href="/" className="text-sm font-semibold md:hidden">AEVORA</Link>
          <span className="hidden text-xs uppercase tracking-wider text-muted md:inline">Company OS</span>
          <UserMenu name={me.name} role={me.actorRole} />
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
