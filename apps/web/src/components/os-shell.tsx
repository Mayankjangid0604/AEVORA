import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Me } from '@/lib/types';
import { CommandPalette } from './command-palette';
import { NavRail } from './nav-rail';
import { UserMenu } from './user-menu';

/**
 * Company OS shell: persistent rail (md+), top bar with command entry and session control, workspace.
 * Below md the rail collapses into the command palette, which lists the same destinations.
 */
export function OsShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg text-text">
      <a href="#workspace" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to workspace
      </a>
      <div className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-border bg-surface md:block">
        <NavRail />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-2.5 backdrop-blur md:px-6">
          <Link href="/" className="text-sm font-semibold tracking-[0.2em] md:hidden">AEVORA</Link>
          <div className="flex flex-1 justify-end md:justify-start"><CommandPalette /></div>
          <UserMenu name={me.name} role={me.actorRole} />
        </header>
        <main id="workspace" tabIndex={-1} className="mx-auto w-full max-w-[96rem] flex-1 p-4 outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
