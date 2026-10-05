import { ActionKind, CeoDecision } from './ceo-decisions.service';

export type FeedKind = 'REVIEW' | 'WEEKLY_REPORT' | ActionKind;

export interface FeedItem {
  id: string;
  at: string;
  kind: FeedKind;
  outcome?: CeoDecision['outcome'];
  title: string;   // one sentence for the timeline
  detail: string;  // full text for the slide-out panel
  reason?: string;
}

const DECISION_KIND: Record<string, ActionKind> = {
  REALLOCATE_AGENT: 'DECISION',
  PAUSE_VENTURE: 'DECISION',
  CHANGE_LEAD_CATEGORY: 'CATEGORY',
  ADJUST_OUTREACH_SCRIPT: 'SCRIPT',
  HIRE_AGENT: 'DECISION',
  ESCALATE_TO_CHAIRMAN: 'ESCALATION',
};

const LABEL: Record<string, string> = {
  REALLOCATE_AGENT: 'Reallocated an agent',
  PAUSE_VENTURE: 'Paused a venture',
  CHANGE_LEAD_CATEGORY: 'Changed lead categories',
  ADJUST_OUTREACH_SCRIPT: 'Rewrote the outreach email',
  HIRE_AGENT: 'Hired a new employee',
  ESCALATE_TO_CHAIRMAN: 'Needs your input',
};

type ReviewRow = { id: string; reviewedAt: Date; topRisk: string; topOpportunity: string; weeklyReport: string; decisionsProposed: unknown };
type WeeklyRow = { id: string; createdAt: Date; weekStartDate: Date; dealsWonCount: number; revenueEarnedPaise: number; biggestChallenge: string; ceoCommentary: string };

/**
 * Flatten reviews (summary + each logged action) and weekly reports into one newest-first timeline.
 * Skipped no-op actions ("nothing to do") are left out so the feed shows what the CEO actually did or tried.
 */
export function buildFeed(reviews: ReviewRow[], weeklies: WeeklyRow[], limit = 20): FeedItem[] {
  const items: FeedItem[] = [];
  for (const r of reviews) {
    const at = r.reviewedAt.toISOString();
    const actions = (Array.isArray(r.decisionsProposed) ? r.decisionsProposed : []) as CeoDecision[];
    actions.forEach((d, i) => {
      if (d.outcome === 'SKIPPED' && d.kind !== 'SCRIPT') return; // no-ops are noise; A/B "script is working" checks are not
      const kind: ActionKind = d.kind ?? DECISION_KIND[d.type] ?? 'PIPELINE';
      const title = d.type === 'PIPELINE_ACTION' ? (d.detail ?? d.reason) : `${LABEL[d.type] ?? d.type}${d.outcome && d.outcome !== 'EXECUTED' ? ` (${d.outcome.toLowerCase()})` : ''}`;
      items.push({
        id: `${r.id}:${i}`,
        at,
        kind,
        outcome: d.outcome,
        title: title.slice(0, 160),
        detail: [d.detail, d.reason && d.reason !== d.detail ? `Why: ${d.reason}` : null].filter(Boolean).join('\n\n'),
        reason: d.reason,
      });
    });
    items.push({
      id: r.id,
      at,
      kind: 'REVIEW',
      title: `Business review — risk: ${r.topRisk}`.slice(0, 160),
      detail: `Top risk: ${r.topRisk}\n\nTop opportunity: ${r.topOpportunity}\n\n${r.weeklyReport}`,
    });
  }
  for (const w of weeklies) {
    items.push({
      id: w.id,
      at: w.createdAt.toISOString(),
      kind: 'WEEKLY_REPORT',
      title: `Weekly report: ${w.dealsWonCount} deal(s), ₹${Math.round(w.revenueEarnedPaise / 100).toLocaleString('en-IN')}`,
      detail: `Biggest challenge: ${w.biggestChallenge}\n\n${w.ceoCommentary}`,
    });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
