'use client';

import React, { useState } from 'react';
import type { CeoOperatingState, DirectiveEvaluationResult } from '@/lib/executive-types';

export interface DisagreementComparisonResult {
  directiveConsequences?: {
    riskTier?: string;
    netScore?: number;
  };
  alternativeConsequences?: {
    riskTier?: string;
    netScore?: number;
  };
}

interface Props {
  state: CeoOperatingState | undefined;
  onSubmitObjective: (title: string, description: string) => Promise<void>;
  onEvaluateDirective: (directive: string) => Promise<DirectiveEvaluationResult | null>;
  onCompareDisagreement: (directive: string, alternative: string) => Promise<DisagreementComparisonResult | null>;
}

export function CeoCommandInterface({
  state,
  onSubmitObjective,
  onEvaluateDirective,
  onCompareDisagreement,
}: Props) {
  // Objective form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmittingObjective, setIsSubmittingObjective] = useState(false);

  // Directive evaluation state
  const [directive, setDirective] = useState('');
  const [isEvaluatingDirective, setIsEvaluatingDirective] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<DirectiveEvaluationResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<DisagreementComparisonResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const handleSubmitObjective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmittingObjective(true);
    try {
      await onSubmitObjective(title.trim(), description.trim());
      setTitle('');
      setDescription('');
    } finally {
      setIsSubmittingObjective(false);
    }
  };

  const handleEvaluateDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directive.trim()) return;
    setIsEvaluatingDirective(true);
    setComparisonResult(null);
    try {
      const res = await onEvaluateDirective(directive.trim());
      setEvaluationResult(res);
    } finally {
      setIsEvaluatingDirective(false);
    }
  };

  const handleRunComparison = async () => {
    if (!directive.trim() || !evaluationResult?.ceoAlternative?.title) return;
    setIsComparing(true);
    try {
      const cmp = await onCompareDisagreement(
        directive.trim(),
        evaluationResult.ceoAlternative.title + ': ' + evaluationResult.ceoAlternative.rationale
      );
      setComparisonResult(cmp);
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* 1. Chairman Objective & Directive Command */}
      <section aria-label="CEO Command Interface" className="rounded-panel border border-border bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          Chairman Command & Strategic Objectives
        </h3>
        <p className="mt-1 text-xs text-muted">
          Authorize strategic corporate objectives. The CEO autonomously decomposes directives into departmental execution initiatives.
        </p>

        <form onSubmit={handleSubmitObjective} className="mt-4 space-y-3">
          <div>
            <label htmlFor="objective-title" className="block text-xs font-medium text-text">
              Strategic Objective Title
            </label>
            <input
              id="objective-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Accelerate Enterprise Q4 Expansion by 25%"
              className="mt-1 w-full rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="objective-desc" className="block text-xs font-medium text-text">
              Context & Boundaries (Optional)
            </label>
            <textarea
              id="objective-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deterministic constraints, budget cap, target completion window..."
              className="mt-1 w-full rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingObjective || !title.trim()}
            className="rounded-control bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmittingObjective ? 'Issuing Directive...' : 'Issue Strategic Objective'}
          </button>
        </form>

        {/* Existing Priorities */}
        {state?.priorities && state.priorities.length > 0 && (
          <div className="mt-5 border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-muted">Active Corporate Priorities</h4>
            <ul className="mt-2 divide-y divide-border/60">
              {state.priorities.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="font-medium text-text">{p.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-control border border-border px-1.5 py-0.5 text-[10px] text-muted">
                      {p.priority}
                    </span>
                    {p.targetDate && (
                      <span className="text-[11px] text-muted">
                        Due: {new Date(p.targetDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 2. Directive Evaluation & CEO Disagreement Interface */}
      <section aria-label="Directive Evaluation & Disagreement" className="rounded-panel border border-border bg-surface p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          CEO Directive Evaluation & Disagreement
        </h3>
        <p className="mt-1 text-xs text-muted">
          AEVORA analyzes proposed mandates against enterprise risk, financial covenants, and capacity before execution.
        </p>

        <form onSubmit={handleEvaluateDirective} className="mt-4 space-y-3">
          <div>
            <label htmlFor="directive-input" className="block text-xs font-medium text-text">
              Proposed Chairman Directive
            </label>
            <textarea
              id="directive-input"
              rows={2}
              required
              value={directive}
              onChange={(e) => setDirective(e.target.value)}
              placeholder="e.g., Immediately double marketing spend on direct campaigns..."
              className="mt-1 w-full rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder-muted/60 focus:border-accent focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isEvaluatingDirective || !directive.trim()}
            className="rounded-control border border-border bg-surface-2 px-4 py-1.5 text-xs font-semibold text-text hover:bg-surface-2/80 disabled:opacity-50"
          >
            {isEvaluatingDirective ? 'Evaluating Constraints...' : 'Evaluate Directive Alignment'}
          </button>
        </form>

        {evaluationResult && (
          <div className="mt-4 rounded-control border border-border bg-surface-2/60 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-text">Evaluation Status:</span>
              <span
                className={`rounded-control px-2 py-0.5 text-[11px] font-semibold ${
                  evaluationResult.conflictDetected
                    ? 'bg-warn-soft text-warn'
                    : 'bg-ok-soft text-ok'
                }`}
              >
                {evaluationResult.conflictDetected ? 'Disagreement / Conflict Detected' : 'Aligned With Strategy'}
              </span>
            </div>

            {evaluationResult.conflictReason && (
              <p className="mt-2 text-muted">
                <span className="font-semibold text-text">Conflict Reason: </span>
                {evaluationResult.conflictReason}
              </p>
            )}

            {/* CEO Alternative Proposal */}
            {evaluationResult.ceoAlternative && (
              <div className="mt-3 rounded-control border border-accent/30 bg-accent-soft p-2.5">
                <p className="font-semibold text-accent">CEO Recommended Alternative:</p>
                <p className="mt-0.5 font-medium text-text">{evaluationResult.ceoAlternative.title}</p>
                <p className="mt-1 text-muted">{evaluationResult.ceoAlternative.rationale}</p>

                {evaluationResult.ceoAlternative.expectedBenefits && (
                  <ul className="mt-1.5 list-inside list-disc text-muted">
                    {evaluationResult.ceoAlternative.expectedBenefits.map((b, idx) => (
                      <li key={idx}>{b}</li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={handleRunComparison}
                  disabled={isComparing}
                  className="mt-3 rounded-control border border-accent bg-accent/20 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent"
                >
                  {isComparing ? 'Simulating Consequences...' : 'Compare Side-by-Side Consequences'}
                </button>
              </div>
            )}

            {/* Consequence Comparison Box */}
            {comparisonResult && (
              <div className="mt-3 rounded-control border border-border bg-surface p-3">
                <h5 className="font-semibold text-text">Consequence Comparison Summary</h5>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-control border border-danger/30 bg-danger-soft/40 p-2">
                    <p className="font-semibold text-danger">Original Directive</p>
                    <p className="mt-0.5 text-muted">Risk Tier: {comparisonResult.directiveConsequences?.riskTier || 'HIGH'}</p>
                    <p className="text-muted">Net Score: {comparisonResult.directiveConsequences?.netScore ?? -15}</p>
                  </div>
                  <div className="rounded-control border border-ok/30 bg-ok-soft/40 p-2">
                    <p className="font-semibold text-ok">CEO Alternative</p>
                    <p className="mt-0.5 text-muted">Risk Tier: {comparisonResult.alternativeConsequences?.riskTier || 'LOW'}</p>
                    <p className="text-muted">Net Score: {comparisonResult.alternativeConsequences?.netScore ?? 42}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
