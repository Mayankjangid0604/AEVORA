'use client';

import React from 'react';
import type { DecisionBrief } from '@/lib/executive-types';

interface Props {
  brief: DecisionBrief | null;
  isOpen: boolean;
  onClose: () => void;
  onApprove?: (decisionId: string) => void;
  onReject?: (decisionId: string) => void;
  onExecute?: (decisionId: string) => void;
  isProcessingAction?: boolean;
}

export function DecisionBriefDrawer({
  brief,
  isOpen,
  onClose,
  onApprove,
  onReject,
  onExecute,
  isProcessingAction,
}: Props) {
  if (!isOpen || !brief) return null;

  const ca = brief.consequenceAnalysis;
  const tierColor =
    ca?.riskTier === 'CRITICAL'
      ? 'border-danger bg-danger-soft text-danger'
      : ca?.riskTier === 'HIGH'
      ? 'border-warn bg-warn-soft text-warn'
      : ca?.riskTier === 'MEDIUM'
      ? 'border-accent bg-accent-soft text-accent'
      : 'border-ok bg-ok-soft text-ok';

  const revColor =
    ca?.reversibility === 'IRREVERSIBLE'
      ? 'text-danger'
      : ca?.reversibility === 'PARTIALLY_REVERSIBLE'
      ? 'text-warn'
      : 'text-ok';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="brief-title"
        className="flex h-full w-full max-w-2xl flex-col bg-surface border-l border-border shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded-control border px-2 py-0.5 text-[11px] font-semibold ${tierColor}`}>
                {ca?.riskTier || 'MEDIUM'} TIER
              </span>
              <span className="text-xs text-muted">ID: {brief.decisionId.substring(0, 12)}</span>
            </div>
            <h2 id="brief-title" className="mt-1 text-base font-semibold text-text">
              {brief.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-control p-1 text-muted hover:bg-surface-2 hover:text-text"
          >
            ✕
          </button>
        </header>

        {/* Content Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4 text-xs">
          {/* Decision Rationale */}
          <section className="rounded-control border border-border bg-surface-2/40 p-3">
            <h3 className="font-semibold uppercase tracking-wider text-muted">Core Decision & Rationale</h3>
            <p className="mt-1 text-text leading-relaxed">{brief.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-4 text-muted">
              <span>Status: <strong className="text-text">{brief.status}</strong></span>
              <span>Urgency: <strong className="text-text">{brief.urgency}</strong></span>
              <span>Type: <strong className="text-text">{brief.decisionType}</strong></span>
            </div>
          </section>

          {/* Consequence Analysis: 14 Dimensions */}
          <section className="rounded-control border border-border p-3">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <h3 className="font-semibold uppercase tracking-wider text-muted">
                14-Dimension Consequence Modeling
              </h3>
              <span className="font-semibold text-text">
                Net Score: {ca?.netScore ?? 0}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ca?.dimensions &&
                Object.entries(ca.dimensions).map(([dim, scoreData]: [string, any]) => (
                  <div key={dim} className="rounded-control border border-border/40 bg-surface-2/30 p-2">
                    <p className="capitalize text-muted">{dim}</p>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span
                        className={`text-sm font-semibold ${
                          scoreData.score >= 0 ? 'text-ok' : 'text-danger'
                        }`}
                      >
                        {scoreData.score > 0 ? `+${scoreData.score}` : scoreData.score}
                      </span>
                      <span className="text-[10px] text-muted">
                        conf: {Math.round((scoreData.confidence || 0.8) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-2/50 px-3 py-2">
              <div>
                <span className="text-muted">Reversibility: </span>
                <strong className={revColor}>{ca?.reversibility || 'REVERSIBLE'}</strong>
              </div>
              <div>
                <span className="text-muted">Uncertainty: </span>
                <strong className="text-text">{ca?.uncertainty?.level || 'LOW'}</strong>
              </div>
              <div>
                <span className="text-muted">Recommendation: </span>
                <strong className="text-accent">{ca?.recommendation || 'PROCEED'}</strong>
              </div>
            </div>
            {ca?.uncertainty?.rationale && (
              <p className="mt-2 text-muted italic">Uncertainty rationale: {ca.uncertainty.rationale}</p>
            )}
          </section>

          {/* Scenario Simulations: 3 Scenarios */}
          {brief.scenarioSimulations && brief.scenarioSimulations.length > 0 && (
            <section className="rounded-control border border-border p-3">
              <h3 className="font-semibold uppercase tracking-wider text-muted">
                Scenario Simulations (Optimistic, Expected, Stress)
              </h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {brief.scenarioSimulations.map((s) => (
                  <div
                    key={s.scenario}
                    className={`rounded-control border p-2 ${
                      s.scenario === 'STRESS'
                        ? 'border-danger/30 bg-danger-soft/20'
                        : s.scenario === 'OPTIMISTIC'
                        ? 'border-ok/30 bg-ok-soft/20'
                        : 'border-border bg-surface-2/30'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className={s.scenario === 'STRESS' ? 'text-danger' : s.scenario === 'OPTIMISTIC' ? 'text-ok' : 'text-text'}>
                        {s.scenario}
                      </span>
                      <span className="text-[10px] text-muted">{Math.round(s.probability * 100)}% prob</span>
                    </div>
                    <p className="mt-1 text-muted">{s.narrative}</p>
                    <p className="mt-1 text-[11px] font-semibold text-text">
                      Fin Delta: {s.projectedFinancialDelta >= 0 ? `+₹${s.projectedFinancialDelta}` : `-₹${Math.abs(s.projectedFinancialDelta)}`}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Evidence & Assumptions */}
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-control border border-border p-3">
              <h3 className="font-semibold uppercase tracking-wider text-muted">Authoritative Evidence</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
                {brief.evidence.length > 0 ? (
                  brief.evidence.map((e, idx) => <li key={idx}>{e}</li>)
                ) : (
                  <li>Historical enterprise state verified</li>
                )}
              </ul>
            </section>

            <section className="rounded-control border border-border p-3">
              <h3 className="font-semibold uppercase tracking-wider text-muted">Explicit Assumptions</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-muted">
                {brief.assumptions.length > 0 ? (
                  brief.assumptions.map((a, idx) => <li key={idx}>{a}</li>)
                ) : (
                  <li>Market demand stability assumed</li>
                )}
              </ul>
            </section>
          </div>

          {/* Alternatives Considered */}
          {brief.alternatives && brief.alternatives.length > 0 && (
            <section className="rounded-control border border-border p-3">
              <h3 className="font-semibold uppercase tracking-wider text-muted">Alternatives Considered</h3>
              <div className="mt-2 space-y-2">
                {brief.alternatives.map((alt, idx) => (
                  <div key={idx} className="rounded-control border border-border/40 bg-surface-2/20 p-2">
                    <div className="flex items-center justify-between font-medium text-text">
                      <span>{alt.title}</span>
                      <span className="text-muted">Score: {alt.score}</span>
                    </div>
                    <p className="mt-0.5 text-muted">{alt.rationale}</p>
                    {alt.tradeoffs && <p className="mt-0.5 text-[11px] text-muted italic">Trade-offs: {alt.tradeoffs}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Authority & Approval Gate Status */}
          <section className="rounded-control border border-border bg-surface-2/30 p-3">
            <h3 className="font-semibold uppercase tracking-wider text-muted">Authority Verification</h3>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted">
                Within Autonomous CEO Limits:{' '}
                <strong className={brief.authorityStatus.withinCeoLimit ? 'text-ok' : 'text-danger'}>
                  {brief.authorityStatus.withinCeoLimit ? 'YES' : 'NO — ESCALATION REQUIRED'}
                </strong>
              </p>
              {brief.approvalRequirement.required && (
                <span className="rounded-control border border-warn bg-warn-soft px-2 py-0.5 font-semibold text-warn">
                  Chairman Approval Required
                </span>
              )}
            </div>
            {brief.approvalRequirement.reason && (
              <p className="mt-1 text-muted">Reason: {brief.approvalRequirement.reason}</p>
            )}
          </section>
        </div>

        {/* Footer Actions */}
        <footer className="flex items-center justify-between border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {brief.status === 'PROPOSED' && brief.approvalRequirement.required && onApprove && (
              <>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => onReject?.(brief.decisionId)}
                  className="rounded-control border border-danger/40 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-50"
                >
                  Reject Decision
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => onApprove(brief.decisionId)}
                  className="rounded-control bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
                >
                  {isProcessingAction ? 'Processing...' : 'Approve Decision'}
                </button>
              </>
            )}

            {brief.status === 'APPROVED' && onExecute && (
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => onExecute(brief.decisionId)}
                className="rounded-control bg-ok px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {isProcessingAction ? 'Executing...' : 'Execute Authorized Decision'}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
