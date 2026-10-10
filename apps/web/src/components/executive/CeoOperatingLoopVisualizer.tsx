'use client';

import React from 'react';
import type { AutonomousOperatingPhase, CeoOperatingState } from '@/lib/executive-types';

const PHASES: { key: AutonomousOperatingPhase; label: string; desc: string }[] = [
  { key: 'OBSERVE', label: '1. Observe', desc: 'Scan enterprise signals' },
  { key: 'UNDERSTAND', label: '2. Understand', desc: 'Enterprise Brain synthesis' },
  { key: 'ANALYZE', label: '3. Analyze', desc: 'Consequence modeling' },
  { key: 'DECIDE', label: '4. Decide', desc: 'Evaluate options' },
  { key: 'AUTHORITY_CHECK', label: '5. Authority', desc: 'Four-tier risk check' },
  { key: 'APPROVE_ESCALATE', label: '6. Escalate', desc: 'Chairman approval gate' },
  { key: 'EXECUTE', label: '7. Execute', desc: 'Gateway action dispatch' },
  { key: 'VERIFY', label: '8. Verify', desc: 'Track external outcome' },
  { key: 'LEARN', label: '9. Learn', desc: 'Expected vs actual review' },
  { key: 'REFLECT', label: '10. Reflect', desc: 'Pattern extraction' },
  { key: 'REPLAN', label: '11. Replan', desc: 'Dynamic recalibration' },
];

interface Props {
  state: CeoOperatingState | undefined;
  isLoading: boolean;
  onRunLoop: () => void;
  isExecutingLoop: boolean;
}

export function CeoOperatingLoopVisualizer({
  state,
  isLoading,
  onRunLoop,
  isExecutingLoop,
}: Props) {
  const current = state?.currentPhase || 'OBSERVE';
  const health = state?.operatingHealth || 'HEALTHY';

  const healthColor =
    health === 'HEALTHY'
      ? 'border-ok/40 bg-ok-soft text-ok'
      : health === 'DEGRADED'
      ? 'border-warn/40 bg-warn-soft text-warn'
      : 'border-danger/40 bg-danger-soft text-danger';

  return (
    <section aria-label="Autonomous Operating Loop" className="rounded-panel border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text">
              Autonomous Operating Loop
            </h2>
            <span className={`rounded-control border px-2 py-0.5 text-[11px] font-semibold ${healthColor}`}>
              {health}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            The closed-loop cognitive cycle continuously evaluates corporate health and executes bounded decisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {state?.lastRunAt && (
            <span className="text-xs text-muted">
              Last cycle: {new Date(state.lastRunAt).toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            disabled={isExecutingLoop || isLoading}
            onClick={onRunLoop}
            className="rounded-control border border-accent bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-50"
          >
            {isExecutingLoop ? 'Running Cycle...' : 'Run Autonomous Loop'}
          </button>
        </div>
      </div>

      {state?.activeGoal && (
        <div className="mt-3 flex items-center gap-2 rounded-control border border-accent/20 bg-accent-soft px-3 py-1.5 text-xs">
          <span className="font-semibold text-accent">Active Executive Goal:</span>
          <span className="truncate text-text">{state.activeGoal}</span>
        </div>
      )}

      {/* 11-step visual progression */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11">
        {PHASES.map((p, idx) => {
          const isCurrent = p.key === current;
          const isPassed = PHASES.findIndex((item) => item.key === current) > idx;

          return (
            <div
              key={p.key}
              className={`flex flex-col justify-between rounded-control border p-2 text-center transition-all ${
                isCurrent
                  ? 'border-accent bg-accent-soft font-semibold text-text shadow-sm'
                  : isPassed
                  ? 'border-border/60 bg-surface-2/40 text-muted'
                  : 'border-border/30 bg-surface text-muted/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted">#{idx + 1}</span>
                {isCurrent && (
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                )}
              </div>
              <p className={`mt-1 text-xs ${isCurrent ? 'font-semibold text-accent' : 'text-text'}`}>
                {p.label.split('. ')[1]}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] text-muted">
                {p.desc}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
