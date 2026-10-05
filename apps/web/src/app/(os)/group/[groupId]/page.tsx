import Link from 'next/link';
import { notFound } from 'next/navigation';
import { backendFetch } from '@/server/api';
import { redirectIfUnauthenticated } from '@/server/guard';
import { SystemState } from '@/components/system-state';
import { isSafeId } from '@/lib/http';
import type { Group } from '@/lib/types';

/** GET /groups/:id - ownership enforced by the backend (assertGroupOwnership). */
export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!isSafeId(groupId)) notFound();
  const r = await backendFetch<Group>(`groups/${groupId}`);
  await redirectIfUnauthenticated(r);
  if (!r.ok) {
    return r.status === 403
      ? <SystemState kind="forbidden" title="You do not have access to this group." />
      : <SystemState kind={r.error.kind} />;
  }
  const companies = r.data.companies ?? [];
  return (
    <section aria-labelledby="group-title" className="space-y-4">
      <h1 id="group-title" className="text-xl font-semibold">{r.data.name}</h1>
      {r.data.description && <p className="text-sm text-muted">{r.data.description}</p>}
      {companies.length === 0
        ? <SystemState kind="empty" detail="This group has no companies." />
        : (
          <ul className="space-y-2">
            {companies.map((c) => (
              <li key={c.id}><Link className="text-accent hover:underline" href={`/company/${c.id}`}>{c.name}</Link> <span className="text-xs text-muted">{c.status}</span></li>
            ))}
          </ul>
        )}
    </section>
  );
}
