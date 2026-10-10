'use client';

import React, { useState } from 'react';
import type { StructuredMemoryItem, StrategicReflectionReportItem } from '@/lib/executive-types';

interface Props {
  memories: StructuredMemoryItem[];
  reflection: StrategicReflectionReportItem | null;
  isLoading: boolean;
  onTriggerReflection: () => Promise<void>;
}

export function OrganizationalMemoryConsole({
  memories,
  reflection,
  isLoading,
  onTriggerReflection,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isReflecting, setIsReflecting] = useState(false);

  const handleReflect = async () => {
    setIsReflecting(true);
    try {
      await onTriggerReflection();
    } finally {
      setIsReflecting(false);
    }
  };

  const filteredMemories =
    selectedCategory === 'ALL'
      ? memories
      : memories.filter((m) => m.category === selectedCategory);

  const getMaturityBadge = (maturity: string) => {
    switch (maturity) {
      case 'CONFIRMED':
        return 'border-ok bg-ok-soft text-ok';
      case 'PROVISIONAL':
        return 'border-accent bg-accent-soft text-accent';
      case 'DEPRECATED':
        return 'border-border bg-surface-2 text-muted';
      default:
        return 'border-warn bg-warn-soft text-warn';
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Strategic Reflection Report Summary */}
      <section aria-label="Strategic Reflection Report" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Strategic Reflection & Closed-Loop Learning
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Empirical review of past decisions comparing expected versus actual corporate outcomes.
            </p>
          </div>
          <button
            type="button"
            disabled={isReflecting || isLoading}
            onClick={handleReflect}
            className="rounded-control border border-accent bg-accent-soft px-3 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent disabled:opacity-50"
          >
            {isReflecting ? 'Reflecting...' : 'Run Strategic Reflection'}
          </button>
        </div>

        {reflection ? (
          <div className="mt-4 space-y-4 text-xs">
            {/* KPI Accuracy Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-control border border-border bg-surface-2/40 p-3">
                <span className="text-[11px] text-muted">Decision Success Rate</span>
                <p className="mt-1 text-base font-semibold text-ok tabular-nums">
                  {Math.round(reflection.decisionSuccessRate * 100)}%
                </p>
                <span className="text-[10px] text-muted">{reflection.evaluationsCount} total evaluations</span>
              </div>

              <div className="rounded-control border border-border bg-surface-2/40 p-3">
                <span className="text-[11px] text-muted">Prediction Accuracy Rate</span>
                <p className="mt-1 text-base font-semibold text-accent tabular-nums">
                  {Math.round(reflection.predictionAccuracyRate * 100)}%
                </p>
                <span className="text-[10px] text-muted">Slice 3 Consequence Engine Calibration</span>
              </div>

              <div className="rounded-control border border-border bg-surface-2/40 p-3">
                <span className="text-[11px] text-muted">Recurring Patterns</span>
                <p className="mt-1 text-base font-semibold text-text tabular-nums">
                  {reflection.recurringPatterns.length} detected
                </p>
                <span className="text-[10px] text-muted">Multi-observation synthesis</span>
              </div>
            </div>

            {/* Replanning Recommendations */}
            {reflection.replanningRecommendations.length > 0 && (
              <div className="rounded-control border border-accent/30 bg-accent-soft/30 p-3">
                <h4 className="font-semibold text-accent">Active Replanning Recommendations</h4>
                <div className="mt-2 space-y-2">
                  {reflection.replanningRecommendations.map((rec, idx) => (
                    <div key={idx} className="rounded-control border border-border/60 bg-surface p-2.5">
                      <div className="flex items-center justify-between font-medium text-text">
                        <span>{rec.recommendation}</span>
                        <span className="rounded-control border border-border px-1.5 py-0.5 text-[10px] text-muted">
                          {rec.urgency} Urgency
                        </span>
                      </div>
                      <p className="mt-1 text-muted">{rec.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted">
            No strategic reflection report generated yet. Click above to run reflection.
          </div>
        )}
      </section>

      {/* 2. Structured Organizational Memory & Lessons */}
      <section aria-label="Organizational Memory & Lessons" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Executive Lessons & Organizational Memory
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Controlled corporate learning artifacts with maturity tracking and deprecation safeguards.
            </p>
          </div>

          <div className="flex items-center gap-1 text-xs">
            {['ALL', 'STRATEGY', 'EXECUTION', 'FINANCE', 'MARKET', 'WORKFORCE'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-control px-2 py-0.5 transition-colors ${
                  selectedCategory === cat
                    ? 'bg-accent text-on-accent font-semibold'
                    : 'text-muted hover:bg-surface-2 hover:text-text'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted">Loading organizational memory...</div>
        ) : filteredMemories.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            No lessons recorded under this category yet.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border/60">
            {filteredMemories.map((m) => (
              <div key={m.id} className="py-3 first:pt-0 last:pb-0 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-control border px-1.5 py-0.5 text-[10px] font-semibold ${getMaturityBadge(m.maturity)}`}>
                      {m.maturity}
                    </span>
                    <span className="rounded-control border border-border px-1.5 py-0.5 text-[10px] text-muted">
                      {m.category}
                    </span>
                    <strong className="text-text">{m.subject}</strong>
                  </div>
                  <span className="text-[11px] text-muted">
                    Confidence: {Math.round(m.confidence * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-muted leading-relaxed">{m.content}</p>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted/80">
                  <span>Domain: {m.applicableDomain}</span>
                  <span>Evidence: {m.evidenceCount} observation(s)</span>
                  <span>Updated: {new Date(m.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
