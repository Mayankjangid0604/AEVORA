'use client';

import React, { useState } from 'react';
import type { CeoAutonomousDecisionSummary } from '@/lib/executive-types';

interface Props {
  decisions: CeoAutonomousDecisionSummary[];
  isLoading: boolean;
  onOpenBrief: (decisionId: string) => void;
  onOpenApproval: (decision: CeoAutonomousDecisionSummary) => void;
  onExecuteDecision: (decisionId: string) => void;
  isExecutingDecision: boolean;
}

export function CeoDecisionCenter({
  decisions,
  isLoading,
  onOpenBrief,
  onOpenApproval,
  onExecuteDecision,
  isExecutingDecision,
}: Props) {
  const [filter, setFilter] = useState<'ALL' | 'PENDING_APPROVAL' | 'PROPOSED' | 'APPROVED' | 'EXECUTED'>('ALL');

  const filtered = decisions.filter((d) => {
    if (filter === 'PENDING_APPROVAL') return d.needsChairmanApproval && d.status === 'PROPOSED';
    if (filter === 'PROPOSED') return d.status === 'PROPOSED';
    if (filter === 'APPROVED') return d.status === 'APPROVED';
    if (filter === 'EXECUTED') return d.status === 'EXECUTED';
    return true;
  });

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'CRITICAL':
        return 'border-danger bg-danger-soft text-danger';
      case 'HIGH':
        return 'border-warn bg-warn-soft text-warn';
      case 'MEDIUM':
        return 'border-accent bg-accent-soft text-accent';
      default:
        return 'border-border bg-surface-2 text-muted';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-accent-soft text-accent';
      case 'EXECUTED':
        return 'bg-ok-soft text-ok';
      case 'REJECTED':
        return 'bg-danger-soft text-danger';
      case 'BLOCKED':
        return 'bg-danger-soft text-danger';
      default:
        return 'bg-surface-2 text-muted';
    }
  };

  return (
    <section aria-label="CEO Decision Center" className="rounded-panel border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Autonomous CEO Decision Lifecycle Center
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Consequence-analyzed decisions undergoing multi-tier authority validation and execution.
          </p>
        </div>

        <div className="flex items-center gap-1 text-xs">
          {[
            { key: 'ALL', label: 'All' },
            { key: 'PENDING_APPROVAL', label: 'Needs Approval' },
            { key: 'PROPOSED', label: 'Proposed' },
            { key: 'APPROVED', label: 'Approved' },
            { key: 'EXECUTED', label: 'Executed' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key as any)}
              className={`rounded-control px-2.5 py-1 transition-colors ${
                filter === item.key
                  ? 'bg-accent font-semibold text-on-accent'
                  : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-muted">Loading decision records...</div>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted">
          No decisions matching the selected filter.
        </div>
      ) : (
        <div className="mt-3 divide-y divide-border/60">
          {filtered.map((d) => (
            <div key={d.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 text-xs">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-control border px-1.5 py-0.5 text-[10px] font-semibold ${getTierBadge(d.riskTier)}`}>
                    {d.riskTier} RISK
                  </span>
                  <span className={`rounded-control px-2 py-0.5 text-[10px] font-semibold ${getStatusBadge(d.status)}`}>
                    {d.status}
                  </span>
                  <span className="text-[11px] text-muted">Type: {d.type}</span>
                  <span className="text-[11px] text-muted">Score: {d.netScore}</span>
                  <span className="text-[11px] text-muted">
                    {new Date(d.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-medium text-text">{d.title}</p>
                <p className="text-[11px] text-muted">{d.recommendation}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenBrief(d.id)}
                  className="rounded-control border border-border bg-surface-2 px-3 py-1.5 font-medium text-text hover:bg-surface-2/80"
                >
                  Decision Brief
                </button>

                {d.needsChairmanApproval && d.status === 'PROPOSED' && (
                  <button
                    type="button"
                    onClick={() => onOpenApproval(d)}
                    className="rounded-control bg-accent px-3 py-1.5 font-semibold text-on-accent hover:opacity-90"
                  >
                    Chairman Review
                  </button>
                )}

                {d.status === 'APPROVED' && (
                  <button
                    type="button"
                    disabled={isExecutingDecision}
                    onClick={() => onExecuteDecision(d.id)}
                    className="rounded-control bg-ok px-3 py-1.5 font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Execute
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
