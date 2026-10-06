'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys } from '@/lib/query-keys';
import type { OperatingCycleView } from '@/lib/types';
import { DetailList, PageHeader } from './page-header';
import { Panel } from './chairman-sections';
import { Timestamp } from './intelligence-views';
import { QueryError, SectionSkeleton } from './query-state';
import { StatusBadge } from './status-badge';
import { SystemState } from './system-state';

const enc = encodeURIComponent;
const base = (companyId: string) => `/company/${enc(companyId)}/operations`;

const TRIGGER: Record<string, string> = { scheduled_business_loop: 'Scheduled business loop (system)', chairman_manual: 'Started by the Chairman' };
const trigger = (t: string) => TRIGGER[t] ?? t;

/** Says what the record says: a recommendation is not an action, and "not dispatched" is not "done". */
function executionText(c: OperatingCycleView) {
  if (!c.execution) return 'No execution recorded';
  if (c.execution.dispatched === true) return `Dispatched: ${c.execution.action ?? 'action not recorded'}`;
  if (c.execution.dispatched === false) return `Not dispatched (${c.execution.result ?? 'no reason recorded'})`;
  return 'Execution state not recorded';
}

export function CycleList({ rows, companyId }: { rows: OperatingCycleView[]; companyId: string }) {
  return (
    <ul className="motion-enter divide-y divide-border">
      {rows.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
          <div className="min-w-[min(100%,16rem)] flex-1">
            <Link href={`${base(companyId)}/${enc(c.id)}`} className="text-sm text-text underline-offset-2 hover:underline">
              {c.recommendation?.title ?? 'No recommendation recorded'}
            </Link>
            <p className="text-xs text-muted">{trigger(c.trigger)} · {executionText(c)}{c.failed ? ' · recorded an error' : ''}</p>
          </div>
          <StatusBadge status={c.phase} />
          <span className="text-xs text-muted"><Timestamp iso={c.startedAt} /></span>
        </li>
      ))}
    </ul>
  );
}

export function OperationsWorkspace({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: companyKeys.operations(companyId, 'cycles'),
    queryFn: ({ signal }) => bffGet<OperatingCycleView[]>(`operating-loop/${enc(companyId)}/cycles`, { companyId, signal }),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Operations" description="Operating-loop cycles recorded for this company (latest 20). Each cycle is produced by AEVORA's rule-based loop, not a model. Read-only." />
      <Panel title="Operating-loop cycles" id="cycles-title">
        {q.isPending ? <SectionSkeleton label="operating-loop cycles" />
          : q.isError ? <QueryError error={q.error} />
          : q.data.length === 0 ? <SystemState kind="empty" title="No cycles" detail="The operating loop has not recorded a cycle for this company." />
          : <CycleList rows={q.data} companyId={companyId} />}
      </Panel>
      <p className="text-xs text-muted">Starting a cycle, giving a verdict and scanning for opportunities change records; they are not available in this release.</p>
    </div>
  );
}

export function CycleDetail({ companyId, cycleId }: { companyId: string; cycleId: string }) {
  const q = useQuery({
    queryKey: companyKeys.operations(companyId, 'cycle', cycleId),
    queryFn: ({ signal }) => bffGet<OperatingCycleView>(`operating-loop/cycle/${enc(cycleId)}`, { companyId, signal }),
  });
  const back = <Link href={base(companyId)} className="text-sm text-accent">Back to operations</Link>;
  if (q.isPending) return <SectionSkeleton label="operating-loop cycle" />;
  if (q.isError) return <div className="space-y-3"><QueryError error={q.error} />{back}</div>;
  const c = q.data;
  const r = c.recommendation;
  return (
    <div className="space-y-6">
      <PageHeader title={r?.title ?? 'Operating-loop cycle'} description="Recorded by the rule-based operating loop. Read-only."
        crumbs={[{ label: 'Operations', href: base(companyId) }]} />
      <Panel title="Cycle" id="cycle-title">
        <DetailList items={[
          { label: 'Phase', value: <StatusBadge status={c.phase} /> },
          { label: 'Trigger', value: trigger(c.trigger) },
          { label: 'Started', value: <Timestamp iso={c.startedAt} /> },
          { label: 'Completed', value: <Timestamp iso={c.completedAt} /> },
          { label: 'Chairman verdict', value: c.chairmanVerdict ?? 'None recorded' },
          { label: 'Error', value: c.failed ? 'The cycle recorded an error (details are not shown)' : 'None recorded' },
        ]} />
      </Panel>
      <Panel title="Recommendation (rule labels, as recorded)" id="rec-title">
        {r ? <DetailList items={[
          { label: 'Option', value: r.title },
          { label: 'Impact label', value: r.impact ?? 'Not recorded' },
          { label: 'Effort label', value: r.effort ?? 'Not recorded' },
          { label: 'Risk label', value: r.risk ?? 'Not recorded' },
        ]} /> : <p className="text-sm text-muted">No recommendation recorded.</p>}
      </Panel>
      <Panel title="Execution" id="exec-title">
        <p className="text-sm text-text">{executionText(c)}</p>
      </Panel>
      {back}
    </div>
  );
}
