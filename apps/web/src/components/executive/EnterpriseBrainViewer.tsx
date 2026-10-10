'use client';

import React from 'react';
import type { EnterpriseBrainSummary, BrainConflict } from '@/lib/executive-types';

interface Props {
  brain: EnterpriseBrainSummary | undefined;
  conflicts: BrainConflict[];
  isLoading: boolean;
}

export function EnterpriseBrainViewer({
  brain,
  conflicts,
  isLoading,
}: Props) {
  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted">Synthesizing Enterprise Brain state...</div>;
  }

  if (!brain) {
    return <div className="p-8 text-center text-xs text-muted">No Enterprise Brain state available.</div>;
  }

  return (
    <div className="space-y-4">
      {/* High-level KPI & Graph Metrics */}
      <section aria-label="Enterprise Brain State" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Enterprise Brain — Unified Derived Intelligence
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Authoritative, read-only corporate topology resolving cross-department data discrepancies.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Graph Nodes: <strong className="text-text">{brain.nodeCount}</strong></span>
            <span>Relationships: <strong className="text-text">{brain.edgeCount}</strong></span>
            <span>Synced: <time className="text-text">{new Date(brain.freshnessTimestamp).toLocaleTimeString()}</time></span>
          </div>
        </div>

        {/* Financial & Operational Cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-control border border-border bg-surface-2/40 p-3">
            <span className="text-[11px] text-muted">Allocated Budget</span>
            <p className="mt-1 text-base font-semibold text-text tabular-nums">
              ₹{brain.financialSummary.totalAllocated.toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] text-muted">Spent: ₹{brain.financialSummary.totalSpent.toLocaleString('en-IN')}</span>
          </div>

          <div className="rounded-control border border-border bg-surface-2/40 p-3">
            <span className="text-[11px] text-muted">Cash Flow Projected</span>
            <p className="mt-1 text-base font-semibold text-text tabular-nums">
              ₹{brain.financialSummary.cashFlowEstimate.toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] text-ok">Positive Runway</span>
          </div>

          <div className="rounded-control border border-border bg-surface-2/40 p-3">
            <span className="text-[11px] text-muted">Workforce Strength</span>
            <p className="mt-1 text-base font-semibold text-text tabular-nums">
              {brain.workforceSummary.activeEmployees} / {brain.workforceSummary.totalEmployees}
            </p>
            <span className="text-[10px] text-muted">{brain.workforceSummary.departmentCount} Departments</span>
          </div>

          <div className="rounded-control border border-border bg-surface-2/40 p-3">
            <span className="text-[11px] text-muted">Active Projects</span>
            <p className="mt-1 text-base font-semibold text-text tabular-nums">
              {brain.projectsSummary.activeProjects}
            </p>
            <span className="text-[10px] text-muted">
              {brain.projectsSummary.blockedProjects > 0
                ? `${brain.projectsSummary.blockedProjects} blocked`
                : 'All projects on track'}
            </span>
          </div>
        </div>

        {/* 4 Pillars of Health */}
        <div className="mt-4 rounded-control border border-border/60 bg-surface-2/20 p-3">
          <span className="text-xs font-semibold text-muted">Enterprise Health Scores</span>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
            <div>
              <span className="text-muted">Financial Health:</span>
              <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-1.5 rounded-full bg-ok"
                  style={{ width: `${Math.round((brain.kpis.financialHealth || 1.0) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <span className="text-muted">Operational Efficiency:</span>
              <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${Math.round((brain.kpis.operationalEfficiency || 1.0) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <span className="text-muted">Delivery Reliability:</span>
              <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-1.5 rounded-full bg-ok"
                  style={{ width: `${Math.round((brain.kpis.deliveryReliability || 1.0) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <span className="text-muted">Strategic Alignment:</span>
              <div className="mt-1 h-1.5 w-full rounded-full bg-surface-2">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${Math.round((brain.kpis.strategicAlignment || 1.0) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Discrepancy & Conflict Detection */}
      <section aria-label="Detected Enterprise Conflicts" className="rounded-panel border border-border bg-surface p-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Automated Discrepancy & Conflict Detection
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Identifies cross-department misalignments, capacity over-commitments, and schedule collisions.
            </p>
          </div>
          <span className="text-xs text-muted">
            {conflicts.length === 0 ? 'No active conflicts' : `${conflicts.length} conflict(s)`}
          </span>
        </div>

        {conflicts.length === 0 ? (
          <div className="py-6 text-center text-xs text-ok">
            ✓ Enterprise graph is fully coherent. No cross-department discrepancies detected.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {conflicts.map((c) => (
              <div key={c.id} className="rounded-control border border-border/80 bg-surface-2/40 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-control border px-2 py-0.5 text-[10px] font-semibold ${
                        c.severity === 'HIGH'
                          ? 'border-danger bg-danger-soft text-danger'
                          : c.severity === 'MEDIUM'
                          ? 'border-warn bg-warn-soft text-warn'
                          : 'border-accent bg-accent-soft text-accent'
                      }`}
                    >
                      {c.severity} {c.type}
                    </span>
                    <span className="font-medium text-text">{c.description}</span>
                  </div>
                </div>
                {c.suggestedResolution && (
                  <p className="mt-1.5 text-muted">
                    <strong className="text-accent">Suggested Resolution: </strong>
                    {c.suggestedResolution}
                  </p>
                )}
                {c.entitiesInvolved.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted">
                    Entities: {c.entitiesInvolved.join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
