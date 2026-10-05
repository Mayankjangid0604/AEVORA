'use client';
import { useQuery } from '@tanstack/react-query';
import { bffGet } from '@/lib/bff-client';
import { companyKeys, type ChairmanView } from '@/lib/query-keys';
import type { ChairmanOverview, CompanyEvent, ManagementDecision, OperationalAlert } from '@/lib/types';
import { QueryError, SectionSkeleton } from './query-state';
import { ActivityList, AttentionList, DecisionList, OverviewFigures, Panel } from './chairman-sections';

const CHAIRMAN_ONLY = 'This view is available to the company Chairman only.';

/**
 * Chairman Home for one company. Every request carries the company as navigation state; the backend
 * (JwtAuthGuard + getCompanyForChairman) decides access. Sections fail independently.
 */
function useChairman<T>(companyId: string, view: ChairmanView) {
  return useQuery({
    queryKey: companyKeys.chairman(companyId, view),
    queryFn: ({ signal }) => bffGet<T>(`chairman/${view}`, { companyId, signal }),
  });
}

export function ChairmanHome({ companyId }: { companyId: string }) {
  const overview = useChairman<ChairmanOverview>(companyId, 'overview');
  const alerts = useChairman<OperationalAlert[]>(companyId, 'alerts');
  const decisions = useChairman<ManagementDecision[]>(companyId, 'decisions');
  const activity = useChairman<CompanyEvent[]>(companyId, 'activity');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="overview-title" aria-busy={overview.isPending}>
          <h2 id="overview-title" className="sr-only">Company overview</h2>
          {overview.isPending ? <SectionSkeleton rows={1} label="overview" />
            : overview.isError ? <QueryError error={overview.error} forbiddenDetail={CHAIRMAN_ONLY} />
            : <OverviewFigures data={overview.data} />}
        </section>

        <Panel title="Pending decisions" id="decisions-title">
          {decisions.isPending ? <SectionSkeleton label="decisions" />
            : decisions.isError ? <QueryError error={decisions.error} forbiddenDetail={CHAIRMAN_ONLY} />
            : <DecisionList decisions={decisions.data} />}
        </Panel>

        <Panel title="Recent activity" id="activity-title">
          {activity.isPending ? <SectionSkeleton label="activity" />
            : activity.isError ? <QueryError error={activity.error} forbiddenDetail={CHAIRMAN_ONLY} />
            : <ActivityList events={activity.data} />}
        </Panel>
      </div>

      <aside aria-label="Attention" className="min-w-0">
        <Panel title="Attention" id="attention-title">
          {alerts.isPending ? <SectionSkeleton label="alerts" />
            : alerts.isError ? <QueryError error={alerts.error} forbiddenDetail={CHAIRMAN_ONLY} />
            : <AttentionList alerts={alerts.data} />}
        </Panel>
      </aside>
    </div>
  );
}
