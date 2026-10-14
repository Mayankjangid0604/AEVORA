'use client';

import React, { useState } from 'react';
import type { ExternalActionAuditItem, OfferContext, V24OfferContext } from '@/lib/executive-types';

interface Props {
  actions: ExternalActionAuditItem[];
  offerContext?: OfferContext;
  v24Context?: V24OfferContext;
  isLoading: boolean;
  onRecordOutcomeFeedback?: (actionId: string, outcomeMetrics: Record<string, unknown>) => Promise<void>;
}

export function ExternalActionGatewayConsole({
  actions,
  offerContext,
  v24Context,
  isLoading,
  onRecordOutcomeFeedback,
}: Props) {
  const context = offerContext ?? v24Context;
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActionId || !feedbackText.trim() || !onRecordOutcomeFeedback) return;
    setIsSubmittingFeedback(true);
    try {
      await onRecordOutcomeFeedback(selectedActionId, { notes: feedbackText.trim() });
      setFeedbackText('');
      setSelectedActionId(null);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

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
      case 'EXECUTED':
        return 'bg-ok-soft text-ok';
      case 'BLOCKED':
        return 'bg-danger-soft text-danger';
      case 'FAILED':
        return 'bg-warn-soft text-warn';
      case 'REPLAYED':
        return 'bg-accent-soft text-accent';
      default:
        return 'bg-surface-2 text-muted';
    }
  };

  return (
    <div className="space-y-4">
      {/* Offer Market Integration Banner */}
      {context && (
        <section aria-label="Offer Market Gateway" className="rounded-panel border border-border bg-surface-2/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-control border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">
                  OFFER ENGINE
                </span>
                <span className="text-xs text-muted">Gateway Provider: {context.offerGatewayProvider || context.v24GatewayProvider}</span>
              </div>
              <p className="mt-1 text-xs text-text">
                Autonomous offer market pipeline: campaigns, customer incentives, and bounded discount dispatch.
              </p>
            </div>
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-muted">Active Campaigns: </span>
                <strong className="text-text">{context.activeCampaignsCount}</strong>
              </div>
              <div>
                <span className="text-muted">Offers Today: </span>
                <strong className="text-text">{context.offersDispatchedToday}</strong>
              </div>
              <div>
                <span className="text-muted">Max Autonomous Discount: </span>
                <strong className="text-accent">{context.maxAutonomousDiscountLimit}% Limit</strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Gateway Action Audit Trail */}
      <section aria-label="External Action Gateway Audit Trail" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              External Action Gateway & Idempotency Audit
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Deterministic 4-tier gateway execution trail. Every external side-effect is cryptographically bound and audited.
            </p>
          </div>
          <span className="text-xs text-muted">Total Events: {actions.length}</span>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted">Loading audit records...</div>
        ) : actions.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">No external actions executed yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/80 text-muted">
                  <th className="py-2 font-medium">Action & Provider</th>
                  <th className="py-2 font-medium">Risk Tier</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Financial Exposure</th>
                  <th className="py-2 font-medium">Idempotency Key</th>
                  <th className="py-2 font-medium">Timestamp</th>
                  <th className="py-2 font-medium text-right">Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {actions.map((act) => (
                  <tr key={act.actionId} className="hover:bg-surface-2/30">
                    <td className="py-2.5">
                      <p className="font-semibold text-text">{act.actionType}</p>
                      <p className="text-[11px] text-muted">{act.provider}</p>
                    </td>
                    <td className="py-2.5">
                      <span className={`rounded-control border px-1.5 py-0.5 text-[10px] font-semibold ${getTierBadge(act.tier)}`}>
                        {act.tier}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`rounded-control px-2 py-0.5 text-[10px] font-semibold ${getStatusBadge(act.status)}`}>
                        {act.status}
                      </span>
                    </td>
                    <td className="py-2.5 tabular-nums text-text">
                      {act.financialExposure > 0 ? `₹${act.financialExposure.toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="py-2.5 font-mono text-[10px] text-muted truncate max-w-[120px]" title={act.idempotencyKey}>
                      {act.idempotencyKey.substring(0, 16)}...
                    </td>
                    <td className="py-2.5 text-muted">
                      {new Date(act.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 text-right">
                      {act.actualOutcomeRecorded ? (
                        <span className="text-[10px] text-ok" title={act.actualOutcomeRecorded}>
                          ✓ Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedActionId(act.actionId)}
                          className="rounded-control border border-border px-2 py-0.5 text-[10px] text-muted hover:bg-surface-2 hover:text-text"
                        >
                          Record Outcome
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal for recording outcome feedback */}
        {selectedActionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-panel border border-border bg-surface p-4 text-xs shadow-xl">
              <h4 className="font-semibold text-text">Record Actual Business Outcome</h4>
              <p className="mt-1 text-muted">
                Feed real-world outcome data back into Organizational Memory to calibrate consequence predictions.
              </p>
              <form onSubmit={handleFeedbackSubmit} className="mt-3 space-y-3">
                <textarea
                  rows={3}
                  required
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="e.g., Email campaign achieved 32% open rate, generated 4 qualified pipeline meetings..."
                  className="w-full rounded-control border border-border bg-surface-2 p-2 text-text placeholder-muted/60 focus:border-accent focus:outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedActionId(null)}
                    className="rounded-control border border-border px-3 py-1 text-muted hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingFeedback || !feedbackText.trim()}
                    className="rounded-control bg-accent px-3 py-1 font-semibold text-on-accent disabled:opacity-50"
                  >
                    {isSubmittingFeedback ? 'Recording...' : 'Submit Outcome Feedback'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
