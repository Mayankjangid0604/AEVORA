import type { ReactNode } from 'react';
import { backendFetch } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { OsShell } from '@/components/os-shell';
import { Providers } from '@/components/providers';
import { SystemState } from '@/components/system-state';
import type { Me } from '@/lib/types';

/** The single authenticated gate for every OS route: identity comes from GET /auth/me, never from the client. */
export default async function OsLayout({ children }: { children: ReactNode }) {
  const me = await backendFetch<Me>('auth/me');
  await redirectIfUnauthenticated(me);
  if (!me.ok) {
    return (
      <main className="mx-auto max-w-lg p-6">
        <SystemState kind={me.error.kind} detail={me.error.message} />
      </main>
    );
  }
  return (
    <Providers>
      <OsShell me={me.data}>{children}</OsShell>
    </Providers>
  );
}
